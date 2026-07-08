import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input as defineInput,
  output,
  signal,
} from '@angular/core';
import {
  LucideCalendarDays,
  LucideChevronDown,
  LucideChevronLeft,
  LucideChevronRight,
} from '@lucide/angular';

import type { DashboardDateRange } from '../../models/dashboard-summary.models';

export type DateRangePreset = 'today' | '7d' | '30d' | 'month' | 'custom';

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

interface PresetOption {
  id: Exclude<DateRangePreset, 'custom'>;
  label: string;
}

interface CalendarDay {
  date: string;
  day: number;
  disabled: boolean;
  inCurrentMonth: boolean;
  isInRange: boolean;
  isSelectedEnd: boolean;
  isSelectedStart: boolean;
  isToday: boolean;
}

const PRESETS: PresetOption[] = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: 'Ultimos 7 dias' },
  { id: '30d', label: 'Ultimos 30 dias' },
  { id: 'month', label: 'Este mes' },
];

@Component({
  selector: 'yep-date-range-picker',
  imports: [LucideCalendarDays, LucideChevronDown, LucideChevronLeft, LucideChevronRight],
  templateUrl: './date-range-picker.html',
  styleUrl: './date-range-picker.scss',
})
export class DateRangePicker {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly range = defineInput.required<DashboardDateRange>();
  readonly preset = defineInput<DateRangePreset>('today');
  readonly rangeChange = output<{ range: DashboardDateRange; preset: DateRangePreset }>();

  readonly currentMonth = signal(monthStart(bogotaTodayParts()));
  readonly draftEnd = signal('');
  readonly draftStart = signal('');
  readonly open = signal(false);
  readonly presets = PRESETS;
  readonly weekdays = WEEKDAYS;

  readonly label = computed(() => {
    const preset = this.preset();
    const option = PRESETS.find((item) => item.id === preset);
    if (option) return option.label;
    return this.compactRangeLabel(this.range());
  });

  readonly monthLabel = computed(() => formatMonthLabel(this.currentMonth()));
  readonly calendarDays = computed<CalendarDay[]>(() =>
    buildCalendarDays(this.currentMonth(), this.draftStart(), this.draftEnd()),
  );

  toggle(): void {
    this.open.update((value) => !value);
    if (this.open()) {
      this.syncDraftFromRange();
    }
  }

  close(): void {
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  closeFromOutside(event: MouseEvent): void {
    const target = event.target instanceof Node ? event.target : null;
    if (target && !this.host.nativeElement.contains(target)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  closeFromEscape(): void {
    this.close();
  }

  isPresetActive(preset: Exclude<DateRangePreset, 'custom'>): boolean {
    return this.preset() === preset;
  }

  previousMonth(): void {
    this.currentMonth.update((value) => addMonths(value, -1));
  }

  nextMonth(): void {
    this.currentMonth.update((value) => addMonths(value, 1));
  }

  choosePreset(preset: Exclude<DateRangePreset, 'custom'>): void {
    this.rangeChange.emit({ range: rangeForPreset(preset), preset });
    this.close();
  }

  selectDate(day: CalendarDay): void {
    if (day.disabled) {
      return;
    }

    const clicked = day.date;
    const start = this.draftStart();
    const end = this.draftEnd();

    if (!start || end) {
      this.draftStart.set(clicked);
      this.draftEnd.set('');
      return;
    }

    const [from, to] = clicked < start ? [clicked, start] : [start, clicked];
    this.draftStart.set(from);
    this.draftEnd.set(to);
    this.rangeChange.emit({ range: rangeFromInputDates(from, to), preset: 'custom' });
    this.close();
  }

  private isoToInputDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const bogota = new Date(date.getTime() - BOGOTA_OFFSET_MS);
    return bogota.toISOString().slice(0, 10);
  }

  private compactRangeLabel(range: DashboardDateRange): string {
    const from = this.isoToInputDate(range.from);
    const to = this.isoToInputDate(range.to);
    return from === to ? from : `${from} - ${to}`;
  }

  private syncDraftFromRange(): void {
    const range = this.range();
    const from = this.isoToInputDate(range.from);
    const to = this.isoToInputDate(range.to);
    this.draftStart.set(from);
    this.draftEnd.set(to);
    this.currentMonth.set(monthStart(from || bogotaTodayParts()));
  }
}

export function defaultDashboardRange(): DashboardDateRange {
  return rangeForPreset('today');
}

export function rangeForPreset(preset: Exclude<DateRangePreset, 'custom'>): DashboardDateRange {
  const today = bogotaTodayParts();
  if (preset === 'today') {
    return rangeFromInputDates(today, today);
  }
  if (preset === 'month') {
    const [year, month] = today.split('-');
    return rangeFromInputDates(`${year}-${month}-01`, today);
  }
  const days = preset === '7d' ? 6 : 29;
  return rangeFromInputDates(addDays(today, -days), today);
}

function rangeFromInputDates(from: string, to: string): DashboardDateRange {
  const [start, end] = from <= to ? [from, to] : [to, from];
  return {
    from: bogotaDateToUtcIso(start, false),
    to: bogotaDateToUtcIso(end, true),
  };
}

function bogotaTodayParts(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function bogotaDateToUtcIso(value: string, endOfDay: boolean): string {
  const [year, month, day] = value.split('-').map(Number);
  const hour = endOfDay ? 23 : 0;
  const minute = endOfDay ? 59 : 0;
  const second = endOfDay ? 59 : 0;
  const ms = endOfDay ? 999 : 0;
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute, second, ms)).toISOString();
}

function addDays(value: string, amount: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return date.toISOString().slice(0, 10);
}

function addMonths(value: string, amount: number): string {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1, 12));
  return date.toISOString().slice(0, 10);
}

function buildCalendarDays(
  monthValue: string,
  selectedStart: string,
  selectedEnd: string,
): CalendarDay[] {
  const [year, month] = monthValue.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const firstWeekday = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - firstWeekday, 12));
  const today = bogotaTodayParts();

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const hasRange = Boolean(selectedStart && selectedEnd);

    return {
      date: iso,
      day: date.getUTCDate(),
      disabled: iso > today,
      inCurrentMonth: date.getUTCMonth() === month - 1,
      isInRange: hasRange && iso > selectedStart && iso < selectedEnd,
      isSelectedEnd: iso === selectedEnd,
      isSelectedStart: iso === selectedStart,
      isToday: iso === today,
    };
  });
}

function formatMonthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1, 12));
  return new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}
