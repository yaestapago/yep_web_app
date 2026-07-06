import { Component, computed, input as defineInput, output, signal } from '@angular/core';
import { LucideCalendarDays, LucideChevronDown } from '@lucide/angular';

import type { DashboardDateRange } from '../../models/dashboard-summary.models';

export type DateRangePreset = 'today' | '7d' | '30d' | 'month' | 'custom';

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

interface PresetOption {
  id: Exclude<DateRangePreset, 'custom'>;
  label: string;
}

const PRESETS: PresetOption[] = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: 'Ultimos 7 dias' },
  { id: '30d', label: 'Ultimos 30 dias' },
  { id: 'month', label: 'Este mes' },
];

@Component({
  selector: 'yep-date-range-picker',
  imports: [LucideCalendarDays, LucideChevronDown],
  templateUrl: './date-range-picker.html',
  styleUrl: './date-range-picker.scss',
})
export class DateRangePicker {
  readonly range = defineInput.required<DashboardDateRange>();
  readonly preset = defineInput<DateRangePreset>('today');
  readonly rangeChange = output<{ range: DashboardDateRange; preset: DateRangePreset }>();

  readonly open = signal(false);
  readonly customFrom = signal('');
  readonly customTo = signal('');
  readonly presets = PRESETS;

  readonly label = computed(() => {
    const preset = this.preset();
    const option = PRESETS.find((item) => item.id === preset);
    if (option) return option.label;
    return this.compactRangeLabel(this.range());
  });

  toggle(): void {
    this.open.update((value) => !value);
    if (this.open()) {
      const range = this.range();
      this.customFrom.set(this.isoToInputDate(range.from));
      this.customTo.set(this.isoToInputDate(range.to));
    }
  }

  close(): void {
    this.open.set(false);
  }

  choosePreset(preset: Exclude<DateRangePreset, 'custom'>): void {
    this.rangeChange.emit({ range: rangeForPreset(preset), preset });
    this.close();
  }

  applyCustom(): void {
    const from = this.customFrom();
    const to = this.customTo();
    if (!from || !to) return;
    this.rangeChange.emit({
      range: rangeFromInputDates(from, to),
      preset: 'custom',
    });
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
