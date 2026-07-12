import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type { SourceEvent } from '../../../shared/models/source-event.models';

const STORAGE_KEY = 'yep_web.tts.enabled';
/** Tope de la cola: evita acumular audio si entra una ráfaga de eventos. */
const MAX_QUEUE = 5;
/** WAV silencioso mínimo (44 bytes de cabecera, 0 muestras) para desbloquear autoplay. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

/**
 * Lectura en voz alta de los eventos de ingreso. El audio lo genera Piper en el
 * backend (`GET /source-events/:id/tts`); aquí solo se decide si suena y se
 * reproduce en orden.
 *
 * - `enabled` se persiste por navegador (localStorage), como `ThemeService`.
 * - La reproducción es **secuencial**: los eventos entran en cola y suenan uno
 *   tras otro, sin solaparse; si la cola se llena, se descartan los nuevos.
 * - **Desbloqueo de autoplay:** el navegador exige un gesto del usuario antes de
 *   reproducir audio. `setEnabled(true)` (el click del toggle) ceba el elemento
 *   con un WAV silencioso. Pero si la voz quedó activada de una sesión previa
 *   (localStorage), al recargar no hay gesto todavía: en ese caso armamos un
 *   desbloqueo diferido al primer click/tecla del usuario, y lo re-armamos si un
 *   `play()` llega a bloquearse. Así nunca queda "encendido pero mudo".
 */
@Injectable({ providedIn: 'root' })
export class TtsPlaybackService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly apiUrl = environment.apiUrl;

  /** Único elemento de audio: reutilizarlo tras el desbloqueo es lo más fiable. */
  private readonly audio: HTMLAudioElement | null =
    this.document.defaultView && 'Audio' in this.document.defaultView
      ? new this.document.defaultView.Audio()
      : null;

  private readonly queue: SourceEvent[] = [];
  private playing = false;
  /** El navegador ya permite reproducir audio (hubo un gesto del usuario). */
  private unlocked = false;
  /** Listener de "primer gesto" pendiente (para poder retirarlo). */
  private gestureUnlock: (() => void) | null = null;

  readonly enabled = signal<boolean>(this.readEnabled());

  constructor() {
    effect(() => {
      const value = this.enabled();
      this.storage()?.setItem(STORAGE_KEY, value ? '1' : '0');
    });

    // Rehidratada como activa desde una sesión anterior: aún no hay gesto en
    // esta, así que el autoplay estaría bloqueado. Armamos el desbloqueo para el
    // primer click/tecla del usuario.
    if (this.enabled()) {
      this.armAutoplayUnlock();
    }
  }

  /**
   * Enciende/apaga la voz. Al encender, ceba el audio dentro del gesto del
   * usuario para que las reproducciones posteriores (disparadas por el SSE) no
   * las bloquee la política de autoplay.
   */
  setEnabled(on: boolean): void {
    this.enabled.set(on);
    if (on) {
      this.unlockAutoplay();
    } else {
      this.stopAndClear();
    }
  }

  /** Encola el evento para leerlo si la voz está activa. */
  speak(event: SourceEvent): void {
    if (!this.enabled() || !this.audio) {
      return;
    }
    if (this.queue.length >= MAX_QUEUE) {
      return; // ráfaga: descartamos para no acumular retraso de audio
    }
    this.queue.push(event);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.playing || !this.audio) {
      return;
    }
    this.playing = true;
    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift()!;
        try {
          const blob = await firstValueFrom(
            this.http.get(`${this.apiUrl}/source-events/${event.id}/tts`, {
              responseType: 'blob',
            }),
          );
          await this.playBlob(blob);
        } catch {
          // Un fallo de audio no debe romper la cola: pasamos al siguiente.
        }
      }
    } finally {
      this.playing = false;
    }
  }

  private playBlob(blob: Blob): Promise<void> {
    const audio = this.audio!;
    const url = URL.createObjectURL(blob);
    return new Promise<void>((resolve) => {
      const done = () => {
        audio.removeEventListener('ended', done);
        audio.removeEventListener('error', done);
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.addEventListener('ended', done);
      audio.addEventListener('error', done);
      audio.src = url;
      // Si el navegador rechaza (autoplay) o `play` no está implementado
      // (SSR/tests), re-armamos el desbloqueo para el próximo gesto, terminamos
      // este turno y seguimos con el siguiente.
      this.tryPlay(audio, () => {
        this.unlocked = false;
        this.armAutoplayUnlock();
        done();
      });
    });
  }

  private unlockAutoplay(): void {
    if (!this.audio) {
      return;
    }
    this.unlocked = true;
    this.removeGestureListeners();
    this.audio.src = SILENT_WAV;
    // Si el navegador lo rechaza igual, el primer evento real reintentará.
    this.tryPlay(this.audio);
  }

  /**
   * Difiere el desbloqueo del audio al primer gesto del usuario (click o tecla),
   * para el caso en que la voz esté activada sin que haya habido un gesto en la
   * sesión actual (p. ej. tras recargar). Idempotente.
   */
  private armAutoplayUnlock(): void {
    const view = this.document.defaultView;
    if (!this.audio || !view || this.unlocked || this.gestureUnlock) {
      return;
    }
    const handler = () => this.unlockAutoplay();
    this.gestureUnlock = handler;
    view.addEventListener('pointerdown', handler, { once: true, passive: true });
    view.addEventListener('keydown', handler, { once: true });
  }

  private removeGestureListeners(): void {
    const view = this.document.defaultView;
    if (view && this.gestureUnlock) {
      view.removeEventListener('pointerdown', this.gestureUnlock);
      view.removeEventListener('keydown', this.gestureUnlock);
    }
    this.gestureUnlock = null;
  }

  /** Llama a `play()` sin propagar excepciones síncronas ni promesas rechazadas. */
  private tryPlay(audio: HTMLAudioElement, onFail?: () => void): void {
    try {
      const result = audio.play() as unknown;
      if (result instanceof Promise) {
        result.catch(() => onFail?.());
      }
    } catch {
      onFail?.();
    }
  }

  private stopAndClear(): void {
    this.queue.length = 0;
    this.removeGestureListeners();
    if (this.audio) {
      this.audio.pause();
    }
  }

  private storage(): Storage | null {
    return this.document.defaultView?.localStorage ?? null;
  }

  private readEnabled(): boolean {
    return this.storage()?.getItem(STORAGE_KEY) === '1';
  }
}
