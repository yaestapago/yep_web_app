import { Component, computed, input as defineInput, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronRight, LucideMail, LucideMonitor, LucideSmartphone } from '@lucide/angular';

import {
  relativeFromMs,
  type NotifierStatus,
  type NotifierStatusLevel,
} from '../../../../shared/utils/notifier-status';
import type { Notifier } from '../../../../shared/models/notifier.models';
import type { DashboardAlert } from '../../../../shared/models/dashboard-summary.models';
import {
  Alert,
  ButtonLink,
  Card,
  IconTile,
  Modal,
  State,
  StatusChip,
  StatusDot,
  type StatusChipTone,
} from '../../../../shared/ui';

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
  imports: [
    RouterLink,
    ButtonLink,
    LucideChevronRight,
    LucideMail,
    LucideMonitor,
    LucideSmartphone,
    Alert,
    Card,
    IconTile,
    Modal,
    State,
    StatusChip,
    StatusDot,
  ],
  templateUrl: './dashboard-status.html',
  styleUrls: ['./dashboard-shared.scss', './dashboard-status.scss'],
})
export class DashboardStatusPanel {
  readonly semaphore = defineInput.required<Semaphore>();
  readonly rows = defineInput.required<NotifierStatusRow[]>();
  readonly alerts = defineInput<DashboardAlert[]>([]);
  readonly loading = defineInput(false);
  readonly error = defineInput('');
  /** Ruta a Notificadores para el estado vacío; `null` si el usuario no puede entrar. */
  readonly notifiersLink = defineInput<string[] | null>(null);
  readonly detailsOpen = signal(false);

  /** Presentación: tono del chip del estado global. */
  readonly semaphoreTone = computed<StatusChipTone>(() => {
    const level = this.semaphore().level;
    return level === 'red' ? 'error' : level === 'yellow' ? 'warning' : 'success';
  });

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
    // Sin `sinceMs` no hay heartbeat que medir (nunca reportó, o es un canal
    // como el correo que no funciona por heartbeat): mostramos su label en vez
    // de un tiempo relativo inventado.
    return status.sinceMs === null ? status.label : relativeFromMs(status.sinceMs);
  }

  lightClass(level: NotifierStatusLevel): string {
    return `nlight nlight--${level}`;
  }
}
