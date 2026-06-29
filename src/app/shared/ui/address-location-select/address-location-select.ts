import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  forwardRef,
  inject,
  input as defineInput,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ControlValueAccessor,
  FormControl,
  FormGroup,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { finalize } from 'rxjs';

import { AddressLocationValue, City, Department } from '../../models/geo.models';
import { GeoApiService } from '../../services/geo-api.service';
import { Select, SelectOption } from '../select/select';

@Component({
  selector: 'yep-address-location-select',
  imports: [ReactiveFormsModule, Select],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AddressLocationSelect),
      multi: true,
    },
  ],
  templateUrl: './address-location-select.html',
  styleUrl: './address-location-select.scss',
})
export class AddressLocationSelect implements ControlValueAccessor, OnInit {
  private readonly geoApi = inject(GeoApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly departmentLabel = defineInput('Departamento');
  readonly cityLabel = defineInput('Ciudad o municipio');
  readonly departmentPlaceholder = defineInput('Selecciona un departamento');
  readonly cityPlaceholder = defineInput('Selecciona una ciudad');
  readonly error = defineInput('');
  readonly required = defineInput(false);
  readonly disabled = defineInput(false);
  readonly dataCy = defineInput('');

  readonly selectionChange = output<AddressLocationValue | null>();

  readonly form = new FormGroup({
    departmentCode: new FormControl<string | null>(null),
    cityCode: new FormControl<string | null>(null),
  });

  readonly departments = signal<Department[]>([]);
  readonly cities = signal<City[]>([]);
  readonly selectedDepartmentCode = signal<string | null>(null);
  readonly loadingDepartments = signal(false);
  readonly loadingCities = signal(false);
  readonly loadError = signal('');

  readonly departmentOptions = computed<SelectOption[]>(() =>
    this.departments().map((department) => ({
      id: department.code,
      label: department.name,
    })),
  );

  readonly cityOptions = computed<SelectOption[]>(() =>
    this.cities().map((city) => ({
      id: city.code,
      label: city.name,
    })),
  );

  private onChange: (value: AddressLocationValue | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private readonly isControlDisabled = signal(false);

  ngOnInit(): void {
    this.loadDepartments();

    this.form.controls.departmentCode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((departmentCode) => {
        this.onTouched();
        this.selectedDepartmentCode.set(departmentCode);
        this.form.controls.cityCode.setValue(null, { emitEvent: false });
        this.cities.set([]);
        this.emitSelection();

        if (departmentCode) {
          this.loadCities(departmentCode);
        }
      });

    this.form.controls.cityCode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.onTouched();
        this.emitSelection();
      });
  }

  writeValue(value: AddressLocationValue | null | undefined): void {
    this.selectedDepartmentCode.set(value?.departmentCode ?? null);
    this.form.setValue(
      {
        departmentCode: value?.departmentCode ?? null,
        cityCode: value?.cityCode ?? null,
      },
      { emitEvent: false },
    );

    if (value?.departmentCode) {
      this.loadCities(value.departmentCode, value.cityCode, false);
    } else {
      this.cities.set([]);
    }
  }

  registerOnChange(fn: (value: AddressLocationValue | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isControlDisabled.set(isDisabled);
    this.updateDisabledState();
  }

  readonly isDisabled = computed(() => this.disabled() || this.isControlDisabled());

  readonly cityDisabled = computed(
    () => this.isDisabled() || !this.selectedDepartmentCode() || this.loadingCities(),
  );

  private loadDepartments(): void {
    this.loadingDepartments.set(true);
    this.loadError.set('');

    this.geoApi
      .listDepartments()
      .pipe(
        finalize(() => this.loadingDepartments.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.departments.set(response.departments);
        },
        error: () => this.loadError.set('No fue posible cargar los departamentos.'),
      });
  }

  private loadCities(departmentCode: string, selectedCityCode?: string, emit = true): void {
    this.loadingCities.set(true);
    this.loadError.set('');

    this.geoApi
      .listCities(departmentCode)
      .pipe(
        finalize(() => this.loadingCities.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.cities.set(response.cities);
          if (selectedCityCode) {
            this.form.controls.cityCode.setValue(selectedCityCode, { emitEvent: false });
          }
          if (emit) {
            this.emitSelection();
          }
        },
        error: () => this.loadError.set('No fue posible cargar las ciudades.'),
      });
  }

  private emitSelection(): void {
    const departmentCode = this.form.controls.departmentCode.value;
    const cityCode = this.form.controls.cityCode.value;
    const department = this.departments().find((item) => item.code === departmentCode);
    const city = this.cities().find((item) => item.code === cityCode);

    const value =
      department && city
        ? {
            departmentCode: department.code,
            departmentName: department.name,
            cityCode: city.code,
            cityName: city.name,
          }
        : null;

    this.onChange(value);
    this.selectionChange.emit(value);
  }

  private updateDisabledState(): void {
    if (this.isDisabled()) {
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
    }
  }
}
