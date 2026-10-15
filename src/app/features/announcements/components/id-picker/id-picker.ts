import { Component, DestroyRef, computed, forwardRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideClipboardPaste, LucideSearch, LucideX } from '@lucide/angular';
import {
  Observable,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';

import { Button } from '../../../../shared/ui/button/button';

export interface IdPickerOption {
  id: string;
  label: string;
  detail?: string;
}

export type IdPickerSearch = (query: string) => Observable<IdPickerOption[]>;

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Separa lo pegado en IDs válidos (ObjectId) y lo que no se reconoció. */
export function parsePastedIds(text: string): { ids: string[]; invalid: string[] } {
  const tokens = text
    .split(/[\s,;]+/)
    .map((token) => token.trim().replace(/^["'`]+|["'`]+$/g, ''))
    .filter(Boolean);
  const ids: string[] = [];
  const invalid: string[] = [];
  for (const token of tokens) {
    if (OBJECT_ID.test(token)) {
      const id = token.toLowerCase();
      if (!ids.includes(id)) ids.push(id);
    } else {
      invalid.push(token);
    }
  }
  return { ids, invalid };
}

/**
 * Elegir negocios, usuarios o celulares por ID para la audiencia de un anuncio.
 * Con `search` busca por nombre en el backend; siempre permite pegar IDs. Es un
 * `ControlValueAccessor` de `string[]` (vacío = todos).
 */
@Component({
  selector: 'app-id-picker',
  imports: [Button, LucideClipboardPaste, LucideSearch, LucideX],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => IdPicker), multi: true }],
  templateUrl: './id-picker.html',
  styleUrl: './id-picker.scss',
})
export class IdPicker implements ControlValueAccessor {
  private readonly destroyRef = inject(DestroyRef);

  readonly label = input.required<string>();
  readonly hint = input('');
  readonly error = input('');
  readonly searchPlaceholder = input('Buscar por nombre');
  /** Qué se elige, en plural y minúscula ("negocios"), para los textos. */
  readonly noun = input('elementos');
  readonly allLabel = input('Todos');
  readonly search = input<IdPickerSearch | null>(null);
  readonly dataTestId = input('');

  readonly ids = signal<string[]>([]);
  readonly disabled = signal(false);
  readonly query = signal('');
  readonly results = signal<IdPickerOption[]>([]);
  readonly searching = signal(false);
  readonly searchError = signal('');
  readonly pasteOpen = signal(false);
  readonly pasteText = signal('');
  readonly pasteError = signal('');
  /** Nombres conocidos (de búsquedas) para mostrar en vez del ID. */
  private readonly known = signal<Record<string, IdPickerOption>>({});

  readonly chips = computed(() =>
    this.ids().map((id) => this.known()[id] ?? { id, label: shortId(id), detail: id }),
  );
  readonly visibleResults = computed(() => {
    const selected = new Set(this.ids());
    return this.results().filter((option) => !selected.has(option.id));
  });

  private readonly queries = new Subject<string>();
  private onChange: (value: string[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    this.queries
      .pipe(
        map((text) => text.trim()),
        debounceTime(300),
        distinctUntilChanged(),
        tap(() => this.searchError.set('')),
        switchMap((text) => {
          const search = this.search();
          if (!search || text.length < 2) {
            this.searching.set(false);
            return of([] as IdPickerOption[]);
          }
          this.searching.set(true);
          return search(text).pipe(
            catchError(() => {
              this.searchError.set('No se pudo buscar. Puedes pegar los IDs.');
              return of([] as IdPickerOption[]);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((options) => {
        this.searching.set(false);
        this.results.set(options);
      });
  }

  onQuery(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.queries.next(value);
  }

  add(option: IdPickerOption): void {
    this.known.update((known) => ({ ...known, [option.id]: option }));
    if (!this.ids().includes(option.id)) this.commit([...this.ids(), option.id]);
  }

  remove(id: string): void {
    this.commit(this.ids().filter((item) => item !== id));
  }

  clear(): void {
    this.commit([]);
  }

  togglePaste(): void {
    this.pasteOpen.update((open) => !open);
    this.pasteError.set('');
  }

  onPasteText(event: Event): void {
    this.pasteText.set((event.target as HTMLTextAreaElement).value);
  }

  addPasted(): void {
    const { ids, invalid } = parsePastedIds(this.pasteText());
    const next = [...this.ids()];
    for (const id of ids) if (!next.includes(id)) next.push(id);
    this.commit(next);
    if (invalid.length) {
      this.pasteError.set(
        `No reconocí: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}. Un ID tiene 24 letras y números.`,
      );
      this.pasteText.set(invalid.join('\n'));
    } else {
      this.pasteError.set('');
      this.pasteText.set('');
      if (ids.length) this.pasteOpen.set(false);
    }
  }

  private commit(ids: string[]): void {
    this.ids.set(ids);
    this.onChange(ids);
    this.onTouched();
  }

  writeValue(value: string[] | null | undefined): void {
    this.ids.set(Array.isArray(value) ? [...value] : []);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}

function shortId(id: string): string {
  return id.length > 10 ? `ID …${id.slice(-6)}` : `ID ${id}`;
}
