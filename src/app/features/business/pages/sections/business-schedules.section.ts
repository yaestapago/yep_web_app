import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
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
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideLoaderCircle,
  LucidePlus,
  LucideX,
} from '@lucide/angular';
import { finalize, forkJoin } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { BusinessLocation } from '../../../../shared/models/bank-account.models';
import type { ApprovedMember, DayOfWeek, Shift } from '../../../../shared/models/schedule.models';
import { Button } from '../../../../shared/ui/button/button';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { Select, type SelectOption } from '../../../../shared/ui/select/select';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import {
  addWeeks,
  dateForDayOfWeek,
  formatDayShort,
  formatMonthTitle,
  isSameWeek,
  startOfWeek,
} from '../../../../shared/utils/week-dates';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

interface DayColumn {
  day: DayOfWeek;
  label: string;
}

interface PositionedShift {
  shift: Shift;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  color: string;
}

interface LegendEntry {
  userId: string;
  label: string;
  color: string;
}

const DAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  0: 'Domingo',
};

const DAY_COLUMNS: DayColumn[] = [
  { day: 1, label: 'Lun' },
  { day: 2, label: 'Mar' },
  { day: 3, label: 'Mié' },
  { day: 4, label: 'Jue' },
  { day: 5, label: 'Vie' },
  { day: 6, label: 'Sáb' },
  { day: 0, label: 'Dom' },
];

/** Paleta estable para colorear por empleado. */
const PALETTE = [
  '#2563eb',
  '#16a34a',
  '#db2777',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#4f46e5',
  '#ca8a04',
  '#0d9488',
];

const HOUR_HEIGHT = 40; // px por hora (compacto: 24h × 40 = 960px)
const PX_PER_MIN = HOUR_HEIGHT / 60;

/** Rango horario fijo del tablero: día completo 00:00–24:00. */
const DAY_RANGE = { start: 0, end: 24 } as const;

/** Hora a la que se posiciona el scroll inicial si no hay turnos. */
const DEFAULT_SCROLL_HOUR = 7;

function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function toTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(1439, minutes));
  const h = String(Math.floor(clamped / 60)).padStart(2, '0');
  const m = String(clamped % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startTime')?.value as string;
  const end = group.get('endTime')?.value as string;
  if (start && end && end <= start) {
    return { endBeforeStart: true };
  }
  return null;
}

/** Requiere al menos un día seleccionado en el turno recurrente. */
function atLeastOneDay(control: AbstractControl): ValidationErrors | null {
  const value = control.value as unknown;
  return Array.isArray(value) && value.length > 0 ? null : { required: true };
}

/**
 * Horarios del negocio: tablero semanal de turnos por (sede, empleado).
 * Es una plantilla semanal recurrente (no eventos con fecha). El owner ve a
 * todos los empleados y puede crear/editar; el staff ve solo sus turnos en
 * modo lectura. Alimenta el ruteo de comprobantes de WhatsApp.
 */
@Component({
  selector: 'app-business-schedules-section',
  imports: [
    ReactiveFormsModule,
    Button,
    Modal,
    Select,
    LucideChevronLeft,
    LucideChevronRight,
    LucideLoaderCircle,
    LucidePlus,
    LucideX,
  ],
  templateUrl: './business-schedules.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessSchedulesSection implements OnInit {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notifications = inject(NotificationModalService);

  readonly hourHeight = HOUR_HEIGHT;
  readonly dayColumns = DAY_COLUMNS;

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
  readonly selectedUserId = signal<string | null>(null);

  /** Lunes de la semana visible en el calendario (la plantilla se proyecta sobre ella). */
  readonly visibleWeekStart = signal<Date>(startOfWeek(new Date()));

  private readonly boardBody = viewChild<ElementRef<HTMLElement>>('boardBody');
  private hasAutoScrolled = false;

  readonly monthTitle = computed(() => formatMonthTitle(this.visibleWeekStart()));
  readonly isCurrentWeek = computed(() => isSameWeek(this.visibleWeekStart(), new Date()));

  constructor() {
    // Scroll inicial del tablero a la primera franja con turnos (o 07:00),
    // para no aterrizar en la madrugada vacía del rango 00:00–24:00.
    effect(() => {
      const body = this.boardBody()?.nativeElement;
      const hour = this.earliestHour();
      if (!body || this.hasAutoScrolled) {
        return;
      }
      body.scrollTop = hour * HOUR_HEIGHT;
      this.hasAutoScrolled = true;
    });
  }

  readonly activeEmployeeName = computed(() => {
    const userId = this.selectedUserId();
    return userId ? this.employeeLabelForUser(userId) : '';
  });

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
    return this.shifts().filter(
      (shift) =>
        (location === 'all' || shift.locationId === location) &&
        (!userId || shift.userId === userId),
    );
  });

  /** Color por empleado, estable según el orden de userId. */
  readonly colorByUser = computed<Map<string, string>>(() => {
    const ids = Array.from(new Set(this.shifts().map((s) => s.userId))).sort();
    return new Map(ids.map((id, i) => [id, PALETTE[i % PALETTE.length]]));
  });

  readonly legend = computed<LegendEntry[]>(() => {
    const ids = Array.from(new Set(this.visibleShifts().map((s) => s.userId))).sort();
    return ids.map((userId) => ({
      userId,
      label: this.employeeLabelForUser(userId),
      color: this.colorByUser().get(userId) ?? PALETTE[0],
    }));
  });

  /** Rango horario del tablero: día completo 00:00–24:00 (fijo). */
  readonly range = computed<{ start: number; end: number }>(() => DAY_RANGE);

  /** Primera hora con turnos visibles (para el scroll inicial); 07:00 si no hay. */
  private readonly earliestHour = computed<number>(() => {
    const shifts = this.visibleShifts();
    if (shifts.length === 0) {
      return DEFAULT_SCROLL_HOUR;
    }
    let min = 24 * 60;
    for (const shift of shifts) {
      min = Math.min(min, toMinutes(shift.startTime));
    }
    return Math.max(0, Math.floor(min / 60));
  });

  readonly hourMarks = computed<number[]>(() => {
    const { start, end } = this.range();
    const marks: number[] = [];
    for (let h = start; h <= end; h++) {
      marks.push(h);
    }
    return marks;
  });

  readonly bodyHeight = computed(() => {
    const { start, end } = this.range();
    return (end - start) * HOUR_HEIGHT;
  });

  private readonly layoutByDay = computed<Map<number, PositionedShift[]>>(() => {
    const startHour = this.range().start;
    const colors = this.colorByUser();
    const byDay = new Map<number, Shift[]>();
    for (const shift of this.visibleShifts()) {
      const list = byDay.get(shift.dayOfWeek) ?? [];
      list.push(shift);
      byDay.set(shift.dayOfWeek, list);
    }

    const result = new Map<number, PositionedShift[]>();
    for (const [day, dayShifts] of byDay) {
      result.set(day, this.packDay(dayShifts, startHour, colors));
    }
    return result;
  });

  readonly shiftForm = this.fb.group(
    {
      locationId: ['', [Validators.required]],
      userId: ['', [Validators.required]],
      days: this.fb.control<DayOfWeek[]>([1], [atLeastOneDay]),
      startTime: ['', [Validators.required]],
      endTime: ['', [Validators.required]],
    },
    { validators: [endAfterStart] },
  );

  ngOnInit(): void {
    this.loadLocations();
    this.loadMembers();
    this.loadSchedules();

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.selectedUserId.set(params.get('userId')));
  }

  layoutForDay(day: number): PositionedShift[] {
    return this.layoutByDay().get(day) ?? [];
  }

  hourLabel(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`;
  }

  /** Día del mes proyectado para una columna en la semana visible, p.ej. "29". */
  dayOfMonth(day: DayOfWeek): string {
    return formatDayShort(dateForDayOfWeek(this.visibleWeekStart(), day));
  }

  /** True si la columna corresponde al día de hoy (solo en la semana actual). */
  isToday(day: DayOfWeek): boolean {
    return this.isCurrentWeek() && (new Date().getDay() as DayOfWeek) === day;
  }

  prevWeek(): void {
    this.visibleWeekStart.update((week) => addWeeks(week, -1));
  }

  nextWeek(): void {
    this.visibleWeekStart.update((week) => addWeeks(week, 1));
  }

  goToday(): void {
    this.visibleWeekStart.set(startOfWeek(new Date()));
  }

  clearEmployeeFilter(): void {
    this.selectedUserId.set(null);
  }

  onLocationFilter(event: SelectOption | SelectOption[] | null): void {
    const option = Array.isArray(event) ? event[0] : event;
    this.selectedLocationId.set(option ? String(option.id) : 'all');
  }

  /** Click en una franja vacía del día: abre "Nuevo turno" prellenado. */
  onColumnClick(day: DayOfWeek, event: MouseEvent): void {
    if (!this.canManage()) {
      return;
    }
    const offsetY = event.offsetY;
    const startHour = this.range().start;
    const rawMinutes = startHour * 60 + offsetY / PX_PER_MIN;
    const rounded = Math.round(rawMinutes / 30) * 30;
    const start = Math.max(0, Math.min(rounded, 1380));
    this.openShiftPrefilled(day, toTime(start), toTime(start + 60));
  }

  onBlockClick(shift: Shift, event: MouseEvent): void {
    event.stopPropagation();
    if (this.canManage()) {
      this.openShift(shift);
    }
  }

  openShift(shift?: Shift): void {
    this.error.set('');
    this.success.set('');
    if (shift) {
      this.editingShiftId.set(shift.id);
      this.shiftForm.reset({
        locationId: shift.locationId,
        userId: shift.userId,
        days: [shift.dayOfWeek],
        startTime: shift.startTime,
        endTime: shift.endTime,
      });
    } else {
      this.editingShiftId.set(null);
      this.shiftForm.reset({
        locationId: this.defaultLocation(),
        userId: this.selectedUserId() ?? '',
        days: [1],
        startTime: '',
        endTime: '',
      });
    }
    this.shiftOpen.set(true);
  }

  async closeShift(): Promise<void> {
    if (this.savingShift()) {
      return;
    }

    if (this.shiftForm.dirty) {
      const confirmed = await this.notifications.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar en el turno.',
        type: 'warning',
        confirmText: 'Descartar',
      });

      if (!confirmed) {
        return;
      }
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
    const base = {
      locationId: raw.locationId,
      userId: raw.userId,
      startTime: raw.startTime,
      endTime: raw.endTime,
    };
    const days = raw.days;
    const editingId = this.editingShiftId();
    this.savingShift.set(true);
    this.error.set('');

    // Al editar se conserva la semántica de "un turno = un día": se hace PATCH
    // del turno editado al primer día; cualquier día adicional se crea aparte.
    // Al crear, se emite un turno por cada día seleccionado (plantilla recurrente).
    const requests$ = editingId
      ? [
          this.businessApi.updateShift(businessId, editingId, { ...base, dayOfWeek: days[0] }),
          ...days
            .slice(1)
            .map((day) => this.businessApi.createShift(businessId, { ...base, dayOfWeek: day })),
        ]
      : days.map((day) => this.businessApi.createShift(businessId, { ...base, dayOfWeek: day }));

    forkJoin(requests$)
      .pipe(
        finalize(() => this.savingShift.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (responses) => {
          this.shifts.update((shifts) => {
            const merged = [...shifts];
            for (const { shift } of responses) {
              const index = merged.findIndex((s) => s.id === shift.id);
              if (index === -1) {
                merged.unshift(shift);
              } else {
                merged[index] = shift;
              }
            }
            return merged;
          });
          this.success.set(this.saveSuccessMessage(editingId !== null, responses.length));
          this.shiftOpen.set(false);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private saveSuccessMessage(editing: boolean, count: number): string {
    if (editing) {
      return count > 1 ? `Turno actualizado y ${count - 1} turno(s) creados.` : 'Turno actualizado.';
    }
    return count > 1 ? `${count} turnos creados.` : 'Turno creado.';
  }

  deleteEditing(): void {
    const id = this.editingShiftId();
    const shift = id ? this.shifts().find((s) => s.id === id) : undefined;
    if (shift) {
      this.deleteShift(shift);
    }
  }

  async deleteShift(shift: Shift): Promise<void> {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }

    const confirmed = await this.notifications.confirm({
      title: 'Eliminar turno',
      message: 'Este turno se eliminara del horario semanal.',
      type: 'error',
      confirmText: 'Eliminar',
    });
    if (!confirmed) {
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
          this.shifts.update((shifts) => shifts.filter((s) => s.id !== shift.id));
          this.success.set('Turno eliminado.');
          this.shiftOpen.set(false);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  employeeLabel(member: ApprovedMember): string {
    const name = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
    return name || member.email || member.identificationNumber || 'Empleado sin datos';
  }

  employeeLabelForUser(userId: string): string {
    const member = this.members().find((m) => (m.userId ?? m.id) === userId);
    return member ? this.employeeLabel(member) : 'Empleado';
  }

  locationName(locationId: string): string {
    return this.locations().find((location) => location.id === locationId)?.name || 'Sede';
  }

  isInvalid(controlName: keyof typeof this.shiftForm.controls): boolean {
    const control = this.shiftForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
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

  private openShiftPrefilled(day: DayOfWeek, startTime: string, endTime: string): void {
    this.error.set('');
    this.success.set('');
    this.editingShiftId.set(null);
    this.shiftForm.reset({
      locationId: this.defaultLocation(),
      userId: this.selectedUserId() ?? '',
      days: [day],
      startTime,
      endTime,
    });
    this.shiftOpen.set(true);
  }

  private defaultLocation(): string {
    const selected = this.selectedLocationId();
    if (selected !== 'all') {
      return selected;
    }
    const locations = this.locations();
    return locations.length === 1 ? locations[0].id : '';
  }

  private packDay(
    dayShifts: Shift[],
    startHour: number,
    colors: Map<string, string>,
  ): PositionedShift[] {
    const sorted = [...dayShifts].sort(
      (a, b) =>
        toMinutes(a.startTime) - toMinutes(b.startTime) ||
        toMinutes(a.endTime) - toMinutes(b.endTime),
    );
    const laneEnds: number[] = [];
    const laneOf = new Map<string, number>();
    for (const shift of sorted) {
      const start = toMinutes(shift.startTime);
      let lane = laneEnds.findIndex((end) => end <= start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(toMinutes(shift.endTime));
      } else {
        laneEnds[lane] = toMinutes(shift.endTime);
      }
      laneOf.set(shift.id, lane);
    }
    const laneCount = Math.max(1, laneEnds.length);
    const base = startHour * 60;
    return sorted.map((shift) => {
      const start = toMinutes(shift.startTime);
      const end = toMinutes(shift.endTime);
      const lane = laneOf.get(shift.id) ?? 0;
      return {
        shift,
        top: (start - base) * PX_PER_MIN,
        height: Math.max((end - start) * PX_PER_MIN, 22),
        leftPct: (lane / laneCount) * 100,
        widthPct: (1 / laneCount) * 100,
        color: colors.get(shift.userId) ?? PALETTE[0],
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
