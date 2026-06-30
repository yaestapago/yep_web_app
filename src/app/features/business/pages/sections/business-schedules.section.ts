import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  NgZone,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LucideLoaderCircle, LucidePlus, LucideTrash2, LucideX } from '@lucide/angular';
import {
  createCalendar,
  createViewWeek,
  type CalendarApp,
  type CalendarEvent,
} from '@schedule-x/calendar';
import { CalendarComponent } from '@schedule-x/angular';
import { Temporal } from 'temporal-polyfill';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { ThemeService } from '../../../../core/services/theme.service';
import type { BusinessLocation } from '../../../../shared/models/bank-account.models';
import type {
  ApprovedMember,
  DayOfWeek,
  Shift,
} from '../../../../shared/models/schedule.models';
import { Button } from '../../../../shared/ui/button/button';
import { Modal } from '../../../../shared/ui/modal/modal';
import { Select, type SelectOption } from '../../../../shared/ui/select/select';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

const TZ = 'America/Bogota';

const DAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  0: 'Domingo',
};

function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startTime')?.value as string;
  const end = group.get('endTime')?.value as string;
  if (start && end && end <= start) {
    return { endBeforeStart: true };
  }
  return null;
}

/**
 * Horarios del negocio: turnos semanales por (sede, empleado). Alimentan el
 * ruteo de comprobantes de WhatsApp (en qué tienda está el empleado en turno).
 * Visualización con Schedule-X (vista semana) + modal propio para el CRUD.
 */
@Component({
  selector: 'app-business-schedules-section',
  imports: [
    ReactiveFormsModule,
    Button,
    Modal,
    Select,
    CalendarComponent,
    LucideLoaderCircle,
    LucidePlus,
    LucideTrash2,
    LucideX,
  ],
  templateUrl: './business-schedules.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessSchedulesSection implements OnInit {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  private readonly theme = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly businessId = this.session.activeBusinessAccountId;
  readonly membership = this.session.activeMembership;
  readonly canManage = computed(
    () =>
      this.membership()?.role === 'account_owner' ||
      this.session.user()?.globalRole === 'account_su',
  );

  readonly shifts = signal<Shift[]>([]);
  readonly locations = signal<BusinessLocation[]>([]);
  readonly members = signal<ApprovedMember[]>([]);
  readonly loading = signal(false);
  readonly savingShift = signal(false);
  readonly deletingId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly message = signal('');
  readonly backendPending = signal(false);
  readonly shiftOpen = signal(false);
  readonly editingShiftId = signal<string | null>(null);
  readonly selectedLocationId = signal<string>('all');
  /** Filtro por empleado (desde la sección Empleados vía ?userId=). */
  readonly selectedUserId = signal<string | null>(null);

  readonly activeEmployeeName = computed(() => {
    const userId = this.selectedUserId();
    return userId ? this.employeeLabelForUser(userId) : '';
  });

  /** Inicio (PlainDate) de la semana visible en el calendario. */
  private readonly weekStart = signal<Temporal.PlainDate | null>(null);

  readonly calendarApp: CalendarApp;

  readonly dayOptions: SelectOption[] = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
    id: day,
    label: DAY_LABELS[day],
  }));

  readonly locationOptions = computed<SelectOption[]>(() =>
    this.locations().map((location) => ({
      id: location.id,
      label: location.name,
    })),
  );

  readonly filterOptions = computed<SelectOption[]>(() => [
    { id: 'all', label: 'Todas las sedes' },
    ...this.locationOptions(),
  ]);

  readonly memberOptions = computed<SelectOption[]>(() =>
    this.members().map((member) => ({
      id: member.userId ?? member.id,
      label: this.employeeLabel(member),
    })),
  );

  readonly visibleShifts = computed<Shift[]>(() => {
    const location = this.selectedLocationId();
    const userId = this.selectedUserId();
    const filtered = this.shifts().filter(
      (shift) =>
        (location === 'all' || shift.locationId === location) &&
        (!userId || shift.userId === userId),
    );
    return [...filtered].sort(
      (a, b) =>
        a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
    );
  });

  readonly shiftForm = this.fb.group(
    {
      locationId: ['', [Validators.required]],
      userId: ['', [Validators.required]],
      dayOfWeek: this.fb.control<DayOfWeek>(1, [Validators.required]),
      startTime: ['', [Validators.required]],
      endTime: ['', [Validators.required]],
    },
    { validators: [endAfterStart] },
  );

  constructor() {
    this.calendarApp = createCalendar({
      views: [createViewWeek()],
      defaultView: 'week',
      locale: 'es-ES',
      firstDayOfWeek: 1,
      timezone: TZ,
      isDark: this.theme.isDark(),
      events: [],
      callbacks: {
        onRangeUpdate: (range) =>
          this.zone.run(() =>
            this.weekStart.set(range.start.toPlainDate()),
          ),
        onEventClick: (event) =>
          this.zone.run(() => this.onEventClick(String(event.id))),
        onClickDateTime: (dateTime) =>
          this.zone.run(() => this.onClickSlot(dateTime)),
      },
    });

    // Re-materializa los turnos como eventos cada vez que cambian o cambia la
    // semana visible.
    effect(() => {
      const start = this.weekStart();
      const shifts = this.visibleShifts();
      if (!start) {
        return;
      }
      this.calendarApp.events.set(this.materialize(shifts, start));
    });

    // Sincroniza el tema del calendario con el modo claro/oscuro de la app.
    effect(() => {
      const dark = this.theme.isDark();
      try {
        this.calendarApp.setTheme(dark ? 'dark' : 'light');
      } catch {
        // El calendario aún no se ha renderizado; isDark del config lo cubre.
      }
    });
  }

  ngOnInit(): void {
    this.loadLocations();
    this.loadMembers();
    this.loadSchedules();

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.selectedUserId.set(params.get('userId')));
  }

  clearEmployeeFilter(): void {
    this.selectedUserId.set(null);
  }

  loadSchedules(): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.message.set('');
    this.businessApi
      .listSchedules(businessId)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.backendPending.set(false);
          this.shifts.set(response.shifts);
        },
        error: (error) => this.handleError(error),
      });
  }

  loadLocations(): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }
    this.businessApi
      .listLocations(businessId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.locations.set(response.locations),
        error: () => this.locations.set([]),
      });
  }

  loadMembers(): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }
    this.businessApi
      .listApprovedMembers(businessId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.members.set(response.memberships),
        error: () => this.members.set([]),
      });
  }

  onLocationFilter(event: SelectOption | SelectOption[] | null): void {
    const option = Array.isArray(event) ? event[0] : event;
    this.selectedLocationId.set(option ? String(option.id) : 'all');
  }

  openShift(shift?: Shift): void {
    this.error.set('');
    this.success.set('');
    if (shift) {
      this.editingShiftId.set(shift.id);
      this.shiftForm.reset({
        locationId: shift.locationId,
        userId: shift.userId,
        dayOfWeek: shift.dayOfWeek,
        startTime: shift.startTime,
        endTime: shift.endTime,
      });
    } else {
      this.editingShiftId.set(null);
      this.shiftForm.reset({
        locationId: '',
        userId: '',
        dayOfWeek: 1,
        startTime: '',
        endTime: '',
      });
    }
    this.shiftOpen.set(true);
  }

  closeShift(): void {
    if (this.savingShift()) {
      return;
    }
    this.shiftOpen.set(false);
  }

  saveShift(): void {
    const businessId = this.businessId();
    if (!businessId || this.shiftForm.invalid) {
      this.shiftForm.markAllAsTouched();
      return;
    }

    const raw = this.shiftForm.getRawValue();
    const request = {
      locationId: raw.locationId,
      userId: raw.userId,
      dayOfWeek: raw.dayOfWeek,
      startTime: raw.startTime,
      endTime: raw.endTime,
    };
    const editingId = this.editingShiftId();
    this.savingShift.set(true);
    this.error.set('');

    const request$ = editingId
      ? this.businessApi.updateShift(businessId, editingId, request)
      : this.businessApi.createShift(businessId, request);

    request$
      .pipe(
        finalize(() => this.savingShift.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.shifts.update((shifts) => {
            const index = shifts.findIndex((s) => s.id === response.shift.id);
            if (index === -1) {
              return [response.shift, ...shifts];
            }
            return shifts.map((s, i) => (i === index ? response.shift : s));
          });
          this.success.set(editingId ? 'Turno actualizado.' : 'Turno creado.');
          this.shiftOpen.set(false);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  deleteShift(shift: Shift): void {
    const businessId = this.businessId();
    if (!businessId || !confirm('¿Eliminar este turno?')) {
      return;
    }
    this.deletingId.set(shift.id);
    this.error.set('');
    this.success.set('');
    this.businessApi
      .deleteShift(businessId, shift.id)
      .pipe(
        finalize(() => this.deletingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.shifts.update((shifts) =>
            shifts.filter((s) => s.id !== shift.id),
          );
          this.success.set('Turno eliminado.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  employeeLabel(member: ApprovedMember): string {
    const name = [member.firstName, member.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return (
      name ||
      member.email ||
      member.identificationNumber ||
      'Empleado sin datos'
    );
  }

  employeeLabelForUser(userId: string): string {
    const member = this.members().find((m) => (m.userId ?? m.id) === userId);
    return member ? this.employeeLabel(member) : 'Empleado';
  }

  locationName(locationId: string): string {
    return (
      this.locations().find((location) => location.id === locationId)?.name ||
      'Sede'
    );
  }

  dayLabel(day: number): string {
    return DAY_LABELS[day] ?? '';
  }

  isInvalid(controlName: keyof typeof this.shiftForm.controls): boolean {
    const control = this.shiftForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  private onEventClick(eventId: string): void {
    const shift = this.shifts().find((s) => s.id === eventId);
    if (shift) {
      this.openShift(shift);
    }
  }

  /** Click en una franja del calendario: abre "Nuevo turno" prellenado. */
  private onClickSlot(dateTime: Temporal.ZonedDateTime): void {
    if (!this.canManage()) {
      return;
    }
    const our: DayOfWeek = (dateTime.dayOfWeek === 7 ? 0 : dateTime.dayOfWeek) as DayOfWeek;
    const pad = (n: number) => String(n).padStart(2, '0');
    const startTime = `${pad(dateTime.hour)}:${pad(dateTime.minute)}`;
    const endTime = `${pad(Math.min(dateTime.hour + 1, 23))}:${pad(dateTime.minute)}`;
    const location = this.selectedLocationId();

    this.error.set('');
    this.success.set('');
    this.editingShiftId.set(null);
    this.shiftForm.reset({
      locationId: location !== 'all' ? location : '',
      userId: this.selectedUserId() ?? '',
      dayOfWeek: our,
      startTime,
      endTime,
    });
    this.shiftOpen.set(true);
  }

  private materialize(
    shifts: Shift[],
    weekStart: Temporal.PlainDate,
  ): CalendarEvent[] {
    return shifts.map((shift) => {
      // Temporal dayOfWeek: 1=lunes..7=domingo; el nuestro: 0=domingo.
      const temporalDow = shift.dayOfWeek === 0 ? 7 : shift.dayOfWeek;
      let date = weekStart;
      for (let i = 0; i < 7; i++) {
        const candidate = weekStart.add({ days: i });
        if (candidate.dayOfWeek === temporalDow) {
          date = candidate;
          break;
        }
      }
      const start = date.toZonedDateTime({
        timeZone: TZ,
        plainTime: Temporal.PlainTime.from(shift.startTime),
      });
      const end = date.toZonedDateTime({
        timeZone: TZ,
        plainTime: Temporal.PlainTime.from(shift.endTime),
      });
      return {
        id: shift.id,
        title: `${this.employeeLabelForUser(shift.userId)} · ${this.locationName(shift.locationId)}`,
        start,
        end,
      };
    });
  }

  private handleError(error: unknown): void {
    this.shifts.set([]);
    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.backendPending.set(true);
      this.message.set(
        'El módulo de horarios aún no está disponible en el backend (endpoint pendiente).',
      );
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.message.set('No tienes permisos para gestionar horarios.');
      return;
    }
    this.message.set(httpErrorMessage(error));
  }
}
