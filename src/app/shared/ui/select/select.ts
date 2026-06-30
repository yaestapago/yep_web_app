import {
  Component,
  ElementRef,
  HostListener,
  computed,
  forwardRef,
  inject,
  input as defineInput,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideCheck, LucideChevronDown, LucideSearch, LucideX } from '@lucide/angular';

type SelectSize = 'sm' | 'md' | 'lg';
type SelectOptionId = string | number;
type SelectValue = SelectOptionId | SelectOptionId[] | null;

export interface SelectOption {
  id: SelectOptionId;
  label: string;
  disabled?: boolean;
  countryCode?: string;
  shortLabel?: string;
  imageUrl?: string;
  secondLabel?: string;
}

export interface SelectOptionGroup {
  category: string;
  options: SelectOption[];
}

type SelectSource = SelectOption | SelectOptionGroup;

let nextSelectId = 0;

@Component({
  selector: 'yep-select',
  imports: [LucideCheck, LucideChevronDown, LucideSearch, LucideX],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Select),
      multi: true,
    },
  ],
  templateUrl: './select.html',
  styleUrl: './select.scss',
})
export class Select implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly id = defineInput(`yep-select-${nextSelectId++}`);
  readonly label = defineInput('');
  readonly placeholder = defineInput('Selecciona una opcion');
  readonly options = defineInput<readonly SelectSource[]>([]);
  readonly size = defineInput<SelectSize>('md');
  readonly hint = defineInput('');
  readonly error = defineInput('');
  readonly disabled = defineInput(false);
  readonly required = defineInput(false);
  readonly multiple = defineInput(false);
  readonly searchable = defineInput(false);
  readonly clearable = defineInput(false);
  readonly showCountryFlags = defineInput(false);
  readonly highlightSelected = defineInput(false);
  readonly showPlaceholderAsLabel = defineInput(false);
  readonly embedded = defineInput(false);
  readonly dataCy = defineInput('');

  readonly selectionChange = output<SelectOption | SelectOption[] | null>();
  readonly cleared = output<void>();
  readonly searchChange = output<string>();
  readonly scrolledToEnd = output<void>();
  readonly enterKey = output<KeyboardEvent>();

  readonly open = signal(false);
  readonly opensUpward = signal(false);
  readonly panelLeft = signal(0);
  readonly panelTop = signal(0);
  readonly panelBottom = signal<number | null>(null);
  readonly panelWidth = signal(0);
  readonly panelMaxHeight = signal(256);
  readonly query = signal('');
  readonly selectedIds = signal<SelectOptionId[]>([]);
  isControlDisabled = false;

  readonly groupedOptions = computed<SelectOptionGroup[]>(() => {
    const options = this.options();
    const groups: SelectOptionGroup[] = [];
    const looseOptions: SelectOption[] = [];

    for (const option of options) {
      if (this.isGroup(option)) {
        groups.push(option);
      } else {
        looseOptions.push(option);
      }
    }

    if (looseOptions.length > 0) {
      groups.unshift({ category: '', options: looseOptions });
    }

    return groups;
  });

  readonly filteredGroups = computed<SelectOptionGroup[]>(() => {
    const query = this.normalize(this.query());
    if (!query) {
      return this.groupedOptions();
    }

    return this.groupedOptions()
      .map((group) => ({
        category: group.category,
        options: group.options.filter((option) =>
          this.normalize(
            `${option.label} ${option.secondLabel ?? ''} ${option.shortLabel ?? ''}`,
          ).includes(query),
        ),
      }))
      .filter((group) => group.options.length > 0);
  });

  readonly flatOptions = computed(() => this.groupedOptions().flatMap((group) => group.options));

  readonly selectedOptions = computed(() => {
    const ids = this.selectedIds();
    return this.flatOptions().filter((option) => ids.includes(option.id));
  });

  readonly buttonText = computed(() => {
    const selected = this.selectedOptions();
    if (selected.length === 0) {
      return this.placeholder();
    }

    const label = selected.map((option) => option.shortLabel || option.label).join(', ');
    return this.showPlaceholderAsLabel() ? `${this.placeholder()}: ${label}` : label;
  });

  private onChange: (value: SelectValue) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private scrollReady = true;

  @HostListener('document:click', ['$event'])
  closeFromOutside(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('window:resize')
  repositionOnResize(): void {
    if (this.open()) {
      this.updatePanelDirection();
    }
  }

  @HostListener('window:scroll')
  repositionOnScroll(): void {
    if (this.open()) {
      this.updatePanelDirection();
    }
  }

  writeValue(value: SelectValue | undefined): void {
    if (Array.isArray(value)) {
      this.selectedIds.set(value);
    } else if (value === null || value === undefined || value === '') {
      this.selectedIds.set([]);
    } else {
      this.selectedIds.set([value]);
    }
  }

  registerOnChange(fn: (value: SelectValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isControlDisabled = isDisabled;
  }

  toggle(): void {
    if (this.disabled() || this.isControlDisabled) {
      return;
    }
    if (this.open()) {
      this.close();
    } else {
      this.updatePanelDirection();
      this.open.set(true);
    }
    this.onTouched();
  }

  close(): void {
    this.open.set(false);
    this.query.set('');
  }

  clear(event?: MouseEvent): void {
    event?.stopPropagation();
    this.selectedIds.set([]);
    this.emitSelection();
    this.cleared.emit();
  }

  selectOption(option: SelectOption): void {
    if (option.disabled) {
      return;
    }

    if (this.multiple()) {
      this.selectedIds.update((ids) =>
        ids.includes(option.id) ? ids.filter((id) => id !== option.id) : [...ids, option.id],
      );
    } else {
      this.selectedIds.set([option.id]);
      this.close();
    }

    this.emitSelection();
  }

  isSelected(option: SelectOption): boolean {
    return this.selectedIds().includes(option.id);
  }

  updateSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.searchChange.emit(value);
  }

  handleSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.enterKey.emit(event);
    }
    if (event.key === 'Escape') {
      this.close();
    }
  }

  handleButtonKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggle();
    }
    if (event.key === 'Escape') {
      this.close();
    }
  }

  handleScroll(event: Event): void {
    const target = event.target as HTMLElement;
    const distanceToEnd = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToEnd < 48 && this.scrollReady) {
      this.scrollReady = false;
      this.scrolledToEnd.emit();
    }
    if (distanceToEnd > 96) {
      this.scrollReady = true;
    }
  }

  flagImageUrl(countryCode: string | undefined): string {
    if (!countryCode || countryCode.length !== 2) {
      return '';
    }
    return `https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`;
  }

  private emitSelection(): void {
    const selected = this.selectedOptions();
    const value = this.multiple() ? selected.map((option) => option.id) : (selected[0]?.id ?? null);
    this.onChange(value);
    this.selectionChange.emit(this.multiple() ? selected : (selected[0] ?? null));
  }

  private updatePanelDirection(): void {
    const button = this.host.nativeElement.querySelector('.yep-select__button');
    if (!(button instanceof HTMLElement)) {
      this.opensUpward.set(false);
      return;
    }

    const rect = button.getBoundingClientRect();
    const viewportHeight = globalThis.window?.innerHeight ?? 0;
    const spacing = 8;
    const optionCount = Math.max(1, this.flatOptions().length);
    const searchHeight = this.searchable() ? 48 : 0;
    const estimatedPanelHeight = Math.min(320, searchHeight + optionCount * 42 + 24);
    const spaceBelow = viewportHeight - rect.bottom - spacing;
    const spaceAbove = rect.top - spacing;
    const opensUpward = spaceBelow < estimatedPanelHeight && spaceAbove > spaceBelow;
    const availableSpace = opensUpward ? spaceAbove : spaceBelow;

    this.opensUpward.set(opensUpward);
    this.panelLeft.set(rect.left);
    this.panelWidth.set(rect.width);
    this.panelMaxHeight.set(
      Math.max(120, Math.min(320, availableSpace - searchHeight - spacing * 3)),
    );

    if (opensUpward) {
      this.panelTop.set(0);
      this.panelBottom.set(viewportHeight - rect.top + spacing / 2);
    } else {
      this.panelTop.set(rect.bottom + spacing / 2);
      this.panelBottom.set(null);
    }
  }

  private isGroup(option: SelectSource): option is SelectOptionGroup {
    return 'options' in option;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
