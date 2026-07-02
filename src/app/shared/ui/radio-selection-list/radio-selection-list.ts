import {
  Component,
  computed,
  forwardRef,
  input as defineInput,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideSearch } from '@lucide/angular';

type RadioSelectionLayout = 'default' | 'description';

export interface RadioSelectionIcon {
  url: string;
  alt: string;
}

export interface RadioSelectionTableItem {
  name: string;
  value: number | string;
}

export interface RadioSelectionOption {
  id: string;
  name: string;
  description?: string;
  iconImages?: RadioSelectionIcon[];
  descriptionIcons?: RadioSelectionIcon[];
  table?: RadioSelectionTableItem[];
  tag?: string;
  halfWidth?: boolean;
  disabled?: boolean;
}

export interface RadioSelectionSearchEvent {
  searchValue: string;
  filteredOptions: RadioSelectionOption[];
}

let nextRadioSelectionId = 0;

@Component({
  selector: 'yep-radio-selection-list',
  imports: [LucideSearch],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RadioSelectionList),
      multi: true,
    },
  ],
  templateUrl: './radio-selection-list.html',
  styleUrl: './radio-selection-list.scss',
})
export class RadioSelectionList implements ControlValueAccessor {
  readonly name = defineInput(`yep-radio-selection-${nextRadioSelectionId++}`);
  readonly options = defineInput<readonly RadioSelectionOption[]>([]);
  readonly typeLayout = defineInput<RadioSelectionLayout>('default');
  readonly alwaysShowDescription = defineInput(true);
  readonly showFilter = defineInput(false);
  readonly filterPlaceholder = defineInput('Buscar');
  readonly disabled = defineInput(false);

  readonly valueChange = output<string>();
  readonly searchChange = output<RadioSelectionSearchEvent>();

  readonly selectedOption = signal<string | null>(null);
  readonly searchValue = signal('');
  isControlDisabled = false;

  readonly filteredOptions = computed(() => {
    const query = this.normalize(this.searchValue());
    const options = this.options();
    if (!query) {
      return options;
    }
    return options.filter((option) =>
      this.normalize(`${option.name} ${option.description ?? ''}`).includes(query),
    );
  });

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null | undefined): void {
    this.selectedOption.set(value ?? null);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isControlDisabled = isDisabled;
  }

  selectOption(option: RadioSelectionOption): void {
    if (this.isDisabled(option)) {
      return;
    }

    this.selectedOption.set(option.id);
    this.onChange(option.id);
    this.onTouched();
    this.valueChange.emit(option.id);
  }

  updateSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchValue.set(value);
    this.searchChange.emit({
      searchValue: value,
      filteredOptions: [...this.filteredOptions()],
    });
  }

  isSelected(option: RadioSelectionOption): boolean {
    return this.selectedOption() === option.id;
  }

  shouldShowDetails(option: RadioSelectionOption): boolean {
    return this.alwaysShowDescription() || this.isSelected(option);
  }

  isDisabled(option: RadioSelectionOption): boolean {
    return this.disabled() || this.isControlDisabled || Boolean(option.disabled);
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
