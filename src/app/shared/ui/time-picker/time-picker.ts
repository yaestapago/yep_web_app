import {
  Component,
  DestroyRef,
  ElementRef,
  forwardRef,
  inject,
  input as defineInput,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideClock } from '@lucide/angular';

/** Alto en px de cada número de la rueda; debe coincidir con `--yep-tp-item-height` en el scss. */
const ITEM_HEIGHT = 36;

/** Alto/ancho aproximados del popover (5 filas + paddings), usados para decidir dónde abrirlo. */
const POPOVER_HEIGHT = 216;
const POPOVER_WIDTH = 168;
const VIEWPORT_MARGIN = 8;

type Wheel = 'hour' | 'minute';

let nextTimePickerId = 0;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Selector de hora "HH:mm" con doble modo: escribir en un `input[type=time]` o elegir
 * con ruedas de scroll (horas 00–23 y minutos 00–59, paso de 1 minuto).
 * `ControlValueAccessor`: guarda siempre un string "HH:mm" (o '' si está vacío).
 */
@Component({
  selector: 'yep-time-picker',
  imports: [LucideClock],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TimePicker),
      multi: true,
    },
  ],
  templateUrl: './time-picker.html',
  styleUrl: './time-picker.scss',
})
export class TimePicker implements ControlValueAccessor {
  readonly id = defineInput(`yep-time-picker-${nextTimePickerId++}`);
  readonly label = defineInput('');
  readonly disabled = defineInput(false);
  readonly error = defineInput('');
  readonly dataCy = defineInput('');

  readonly hours = Array.from({ length: 24 }, (_, i) => i);
  readonly minutes = Array.from({ length: 60 }, (_, i) => i);

  readonly open = signal(false);
  readonly displayValue = signal('');
  readonly hour = signal(0);
  readonly minute = signal(0);
  readonly isControlDisabled = signal(false);
  readonly popoverStyle = signal<Record<string, string>>({});

  private readonly destroyRef = inject(DestroyRef);
  private readonly control = viewChild<ElementRef<HTMLElement>>('control');
  private readonly popover = viewChild<ElementRef<HTMLElement>>('popover');
  private readonly hourList = viewChild<ElementRef<HTMLElement>>('hourList');
  private readonly minuteList = viewChild<ElementRef<HTMLElement>>('minuteList');
  private readonly scrollTimers: Record<Wheel, ReturnType<typeof setTimeout> | undefined> = {
    hour: undefined,
    minute: undefined,
  };
  private stopWatchingViewport: (() => void) | undefined;

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  pad = pad;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopWatchingViewport?.());
  }

  toggleOpen(): void {
    if (this.disabled() || this.isControlDisabled()) {
      return;
    }
    if (this.open()) {
      this.close();
      return;
    }
    this.updatePosition();
    this.open.set(true);
    this.watchViewport();
    // Espera al render del popover para centrar las ruedas en el valor actual.
    setTimeout(() => this.syncScroll(), 30);
  }

  close(): void {
    this.stopWatchingViewport?.();
    this.stopWatchingViewport = undefined;
    if (this.open()) {
      this.open.set(false);
      this.onTouched();
    }
  }

  /**
   * Posiciona el popover con coordenadas fijas (no relativas a un ancestro con scroll,
   * como el body del modal) y lo abre hacia arriba si no hay espacio suficiente debajo.
   */
  private updatePosition(): void {
    const el = this.control()?.nativeElement;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < POPOVER_HEIGHT + VIEWPORT_MARGIN && spaceAbove > spaceBelow;
    const top = openUp
      ? Math.max(VIEWPORT_MARGIN, rect.top - POPOVER_HEIGHT - 4)
      : Math.min(rect.bottom + 4, window.innerHeight - POPOVER_HEIGHT - VIEWPORT_MARGIN);
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN,
    );
    this.popoverStyle.set({ top: `${top}px`, left: `${left}px` });
  }

  /**
   * Cierra el popover si el usuario hace scroll (p. ej. el body del modal) o redimensiona,
   * para que no quede desalineado del input. Ignora el scroll que ocurre dentro de las
   * propias ruedas de horas/minutos (si no, cada scroll para elegir hora lo cerraría).
   */
  private watchViewport(): void {
    this.stopWatchingViewport?.();
    const handler = (event: Event) => {
      const target = event.target as Node | null;
      const popoverEl = this.popover()?.nativeElement;
      if (popoverEl && target && popoverEl.contains(target)) {
        return;
      }
      this.close();
    };
    window.addEventListener('scroll', handler, { capture: true, passive: true });
    window.addEventListener('resize', handler, { passive: true });
    this.stopWatchingViewport = () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }

  /** Selección por click en un número de la rueda. */
  pick(wheel: Wheel, value: number): void {
    this.setWheel(wheel, value);
    this.scrollTo(wheel, value, true);
  }

  /** Selección por teclado (flechas ↑/↓) dentro de una rueda. */
  onWheelKeydown(wheel: Wheel, event: KeyboardEvent): void {
    const current = wheel === 'hour' ? this.hour() : this.minute();
    const max = wheel === 'hour' ? 23 : 59;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.pick(wheel, clamp(current + 1, 0, max));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.pick(wheel, clamp(current - 1, 0, max));
    }
  }

  /** Selección por scroll: al asentarse, el número centrado pasa a ser el elegido. */
  onScroll(wheel: Wheel): void {
    const el = wheel === 'hour' ? this.hourList() : this.minuteList();
    if (!el) {
      return;
    }
    clearTimeout(this.scrollTimers[wheel]);
    this.scrollTimers[wheel] = setTimeout(() => {
      const max = wheel === 'hour' ? 23 : 59;
      const index = clamp(Math.round(el.nativeElement.scrollTop / ITEM_HEIGHT), 0, max);
      this.setWheel(wheel, index);
    }, 120);
  }

  updateFromInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.displayValue.set(raw);
    if (raw) {
      const [h, m] = raw.split(':').map(Number);
      if (!Number.isNaN(h)) {
        this.hour.set(clamp(h, 0, 23));
      }
      if (!Number.isNaN(m)) {
        this.minute.set(clamp(m, 0, 59));
      }
    }
    this.onChange(raw);
  }

  markTouched(): void {
    this.onTouched();
  }

  writeValue(value: string | null | undefined): void {
    const raw = value ?? '';
    this.displayValue.set(raw);
    if (raw) {
      const [h, m] = raw.split(':').map(Number);
      if (!Number.isNaN(h)) {
        this.hour.set(clamp(h, 0, 23));
      }
      if (!Number.isNaN(m)) {
        this.minute.set(clamp(m, 0, 59));
      }
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isControlDisabled.set(isDisabled);
  }

  private setWheel(wheel: Wheel, value: number): void {
    if (wheel === 'hour') {
      if (this.hour() === value) {
        return;
      }
      this.hour.set(value);
    } else {
      if (this.minute() === value) {
        return;
      }
      this.minute.set(value);
    }
    this.commit();
  }

  private commit(): void {
    const next = `${pad(this.hour())}:${pad(this.minute())}`;
    this.displayValue.set(next);
    this.onChange(next);
  }

  private syncScroll(): void {
    this.scrollTo('hour', this.hour(), false);
    this.scrollTo('minute', this.minute(), false);
  }

  private scrollTo(wheel: Wheel, index: number, smooth: boolean): void {
    const el = wheel === 'hour' ? this.hourList() : this.minuteList();
    el?.nativeElement.scrollTo({ top: index * ITEM_HEIGHT, behavior: smooth ? 'smooth' : 'auto' });
  }
}
