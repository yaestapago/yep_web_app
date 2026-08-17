import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideFileDown } from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { DashboardDateRange } from '../../../../shared/models/dashboard-summary.models';
import { Button } from '../../../../shared/ui/button/button';
import {
  DateRangePicker,
  defaultDashboardRange,
  type DateRangePreset,
} from '../../../../shared/ui/date-range-picker/date-range-picker';
import { Select, type SelectOption } from '../../../../shared/ui/select/select';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';
import { ReportsApiService } from '../../services/reports-api.service';

// yep-select trata '' como "sin selección" (nunca la muestra elegida), así
// que la opción "todas las sedes" necesita un id no vacío.
const ALL_LOCATIONS_OPTION_ID = 'all';

/**
 * Informes generables por el negocio activo. Primer informe: movimientos
 * del panel en PDF para un rango de fechas y una sede opcional (ver reports.controller.ts
 * en el backend). Disponible tanto para owner como para staff.
 */
@Component({
  selector: 'app-business-reports-section',
  imports: [FormsModule, Button, DateRangePicker, Select, LucideFileDown],
  templateUrl: './business-reports.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessReportsSection implements OnInit {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly reportsApi = inject(ReportsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly range = signal<DashboardDateRange>(defaultDashboardRange());
  readonly preset = signal<DateRangePreset>('today');
  readonly generatingPdf = signal(false);
  readonly generatingCsv = signal(false);
  readonly error = signal<string | null>(null);
  readonly locationId = signal<string>(ALL_LOCATIONS_OPTION_ID);
  readonly locationOptions = signal<SelectOption[]>([
    { id: ALL_LOCATIONS_OPTION_ID, label: 'Todas las sedes' },
  ]);

  readonly businessAccountId = computed(() => this.session.activeBusinessAccountId());

  ngOnInit(): void {
    const businessAccountId = this.businessAccountId();
    if (!businessAccountId) {
      return;
    }
    this.businessApi
      .listLocations(businessAccountId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.locationOptions.set([
            { id: ALL_LOCATIONS_OPTION_ID, label: 'Todas las sedes' },
            ...response.locations.map((location) => ({ id: location.id, label: location.name })),
          ]);
        },
        error: () => {
          // Si falla la carga de sedes, se mantiene solo la opción "Todas las sedes".
        },
      });
  }

  onRangeChange(value: { range: DashboardDateRange; preset: DateRangePreset }): void {
    this.range.set(value.range);
    this.preset.set(value.preset);
  }

  onLocationChange(value: string | number | null): void {
    this.locationId.set(typeof value === 'string' ? value : ALL_LOCATIONS_OPTION_ID);
  }

  generateCashSummary(): void {
    const businessAccountId = this.businessAccountId();
    if (!businessAccountId || this.generatingPdf()) {
      return;
    }

    this.error.set(null);
    this.generatingPdf.set(true);

    const locationId = this.locationId();
    this.reportsApi
      .cashSummaryPdf(
        businessAccountId,
        this.range(),
        locationId === ALL_LOCATIONS_OPTION_ID ? undefined : locationId,
      )
      .pipe(finalize(() => this.generatingPdf.set(false)))
      .subscribe({
        next: (pdf) => this.downloadPdf(pdf),
        error: (err: HttpErrorResponse) => void this.handleError(err),
      });
  }

  generateCashSummaryCsv(): void {
    const businessAccountId = this.businessAccountId();
    if (!businessAccountId || this.generatingCsv()) {
      return;
    }

    this.error.set(null);
    this.generatingCsv.set(true);

    const locationId = this.locationId();
    this.reportsApi
      .cashSummaryCsv(
        businessAccountId,
        this.range(),
        locationId === ALL_LOCATIONS_OPTION_ID ? undefined : locationId,
      )
      .pipe(finalize(() => this.generatingCsv.set(false)))
      .subscribe({
        next: (csv) => this.downloadCsv(csv),
        error: (err: HttpErrorResponse) => void this.handleError(err),
      });
  }

  /** El backend responde el error como Blob JSON cuando responseType es 'blob'. */
  private async handleError(err: HttpErrorResponse): Promise<void> {
    if (err.error instanceof Blob && err.error.type.includes('json')) {
      try {
        const parsed = JSON.parse(await err.error.text());
        const message = Array.isArray(parsed?.message) ? parsed.message.join(' ') : parsed?.message;
        this.error.set(typeof message === 'string' ? message : 'No se pudo generar el informe.');
        return;
      } catch {
        // sigue al mensaje genérico
      }
    }
    this.error.set(httpErrorMessage(err));
  }

  private downloadPdf(pdf: Blob): void {
    const url = URL.createObjectURL(pdf);
    const link = document.createElement('a');
    const { from, to } = this.range();
    link.href = url;
    link.download = `reporte-movimientos_${from.slice(0, 10)}_${to.slice(0, 10)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private downloadCsv(csv: Blob): void {
    const url = URL.createObjectURL(csv);
    const link = document.createElement('a');
    const { from, to } = this.range();
    link.href = url;
    link.download = `reporte-movimientos_${from.slice(0, 10)}_${to.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
