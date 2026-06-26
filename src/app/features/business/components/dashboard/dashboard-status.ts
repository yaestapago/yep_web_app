import { Component, input as defineInput } from '@angular/core';
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
  imports: [LucideBellRing, LucideCircleCheck, LucideLoaderCircle, LucideTriangleAlert],
  templateUrl: './dashboard-status.html',
  styleUrls: ['./dashboard-shared.scss', './dashboard-status.scss'],
})
export class DashboardStatusPanel {
  readonly semaphore = defineInput.required<Semaphore>();
  readonly rows = defineInput.required<NotifierStatusRow[]>();
  readonly loading = defineInput(false);
  readonly error = defineInput('');
  /**
   * `vertical` (por defecto): columna estrecha junto a las gráficas.
   * `horizontal`: barra a lo ancho (cuando las gráficas están ocultas), con el
   * semáforo a la izquierda y los notificadores como chips que envuelven.
   */
  readonly layout = defineInput<'vertical' | 'horizontal'>('vertical');

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
