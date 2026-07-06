import { Component, input as defineInput, signal } from '@angular/core';
import {
  LucideBellRing,
  LucideCircleCheck,
  LucideLoaderCircle,
  LucideTriangleAlert,
} from '@lucide/angular';

import {
  relativeFromMs,
  type NotifierStatus,
  type NotifierStatusLevel,
} from '../../../../shared/utils/notifier-status';
import type { Notifier } from '../../../../shared/models/notifier.models';
import type { DashboardAlert } from '../../../../shared/models/dashboard-summary.models';
import { Modal } from '../../../../shared/ui/modal/modal';

export type SemaphoreLevel = 'green' | 'yellow' | 'red';

export interface Semaphore {
  level: SemaphoreLevel;
  label: string;
  detail: string;
}

export interface NotifierStatusRow {
  notifier: Notifier;
  status: NotifierStatus;
}

/**
 * Zona 2: lectura rápida del estado del sistema. Semáforo global arriba +
 * lista compacta de notificadores con su luz de heartbeat. No calcula nada:
 * recibe todo derivado del orquestador.
 */
@Component({
  selector: 'app-dashboard-status',
  imports: [LucideBellRing, LucideCircleCheck, LucideLoaderCircle, LucideTriangleAlert, Modal],
  templateUrl: './dashboard-status.html',
  styleUrls: ['./dashboard-shared.scss', './dashboard-status.scss'],
})
export class DashboardStatusPanel {
  readonly semaphore = defineInput.required<Semaphore>();
  readonly rows = defineInput.required<NotifierStatusRow[]>();
  readonly alerts = defineInput<DashboardAlert[]>([]);
  readonly loading = defineInput(false);
  readonly error = defineInput('');
  readonly detailsOpen = signal(false);

  openDetails(): void {
    this.detailsOpen.set(true);
  }

  closeDetails(): void {
    this.detailsOpen.set(false);
  }

  severityLabel(severity: DashboardAlert['severity']): string {
    return severity === 'red' ? 'Atención' : 'Pendiente';
  }

  notifierName(notifier: Notifier): string {
    return notifier.displayName?.trim() || 'Notificador sin nombre';
  }

  relative(status: NotifierStatus): string {
    return status.level === 'unknown' ? 'Sin datos' : relativeFromMs(status.sinceMs);
  }

  lightClass(level: NotifierStatusLevel): string {
    return `nlight nlight--${level}`;
  }
}
