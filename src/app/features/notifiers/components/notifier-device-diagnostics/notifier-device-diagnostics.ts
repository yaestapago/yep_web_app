import { Component, computed, input as defineInput } from '@angular/core';
import { LucideMessageSquare, LucideTriangleAlert } from '@lucide/angular';

import type {
  Notifier,
  NotifierDiscardReason,
  NotifierRecentDiscard,
} from '../../../../shared/models/notifier.models';
import { formatDateTime } from '../../../../shared/utils/billing-format';

/** Nombres conocidos de apps de SMS y bancarias, para mostrar algo legible. */
const KNOWN_APP_LABELS: Record<string, string> = {
  'com.google.android.apps.messaging': 'Mensajes de Google',
  'com.samsung.android.messaging': 'Mensajes de Samsung',
  'com.android.mms': 'Mensajes',
  'com.android.messaging': 'Mensajes',
  'com.miui.sms': 'Mensajes de Xiaomi',
  'com.xiaomi.mms': 'Mensajes de Xiaomi',
  'com.huawei.mms': 'Mensajes de Huawei',
  'com.hihonor.mms': 'Mensajes de Honor',
  'com.transsion.messaging': 'Mensajes (Infinix/Tecno)',
  'com.motorola.messaging': 'Mensajes de Motorola',
  'com.nequi.mobileapp': 'Nequi',
  'com.nequi.app': 'Nequi',
  'com.todo1.mobile': 'Bancolombia',
  'com.bancolombia.app.personas': 'Bancolombia',
  'com.davivienda.daviplata': 'Daviplata',
  'com.whatsapp': 'WhatsApp',
};

interface ReasonCopy {
  label: string;
  hint: string;
}

/** Motivo en español + qué puede hacer el dueño. */
export const DISCARD_REASON_COPY: Record<NotifierDiscardReason, ReasonCopy> = {
  sender_not_matched: {
    label: 'Remitente no reconocido',
    hint: 'El SMS llegó de un remitente que no reconocemos. Si guardaste el número del banco como contacto, puede verse con otro nombre.',
  },
  content_not_matched: {
    label: 'Texto no reconocido',
    hint: 'El texto no coincide con un ingreso que sepamos leer. Escríbenos para revisarlo.',
  },
  package_not_watched: {
    label: 'App no escuchada',
    hint: 'Llegó por una app que no estamos escuchando.',
  },
};

const REASON_ORDER: NotifierDiscardReason[] = [
  'sender_not_matched',
  'content_not_matched',
  'package_not_watched',
];

interface DiscardRow {
  key: string;
  appLabel: string | null;
  packageName: string;
  countLabel: string;
  lastAtLabel: string;
}

interface DiscardGroup {
  reason: NotifierDiscardReason;
  label: string;
  hint: string;
  rows: DiscardRow[];
}

/** `Mensajes de Google` si se conoce, o `null` para mostrar solo el paquete. */
export function knownAppLabel(packageName: string | null | undefined): string | null {
  if (!packageName) return null;
  return KNOWN_APP_LABELS[packageName.toLowerCase()] ?? null;
}

/** `1 aviso` / `12 avisos`. */
export function discardCountLabel(count: number): string {
  return count === 1 ? '1 aviso' : `${count.toLocaleString('es-CO')} avisos`;
}

/**
 * Diagnóstico del teléfono emparejado de un notificador de celular: qué app de
 * SMS usa (la reporta la app móvil) y qué avisos que parecían bancarios dejó de
 * enviar en los últimos 30 días, agrupados por motivo con una pista de qué hacer.
 * No renderiza nada para correo/escritorio ni sin teléfono emparejado.
 */
@Component({
  selector: 'app-notifier-device-diagnostics',
  imports: [LucideMessageSquare, LucideTriangleAlert],
  templateUrl: './notifier-device-diagnostics.html',
  styleUrl: './notifier-device-diagnostics.scss',
})
export class NotifierDeviceDiagnostics {
  readonly notifier = defineInput.required<Notifier>();

  /** Solo teléfonos emparejados tienen app de SMS y descartes. */
  readonly visible = computed(
    () => this.notifier().type === 'phone_app' && !!this.notifier().pairedDevice,
  );

  readonly smsPackage = computed(() => this.notifier().pairedDevice?.defaultSmsPackage ?? null);
  readonly smsAppLabel = computed(() => knownAppLabel(this.smsPackage()));

  private readonly discards = computed<NotifierRecentDiscard[]>(
    () => this.notifier().recentDiscards ?? [],
  );

  /** `12 en los últimos 30 días` (suma de todos los motivos). */
  readonly totalLabel = computed(() => {
    const total = this.discards().reduce((sum, discard) => sum + discard.count, 0);
    return `${total.toLocaleString('es-CO')} en los últimos 30 días`;
  });

  readonly groups = computed<DiscardGroup[]>(() => {
    const byReason = new Map<NotifierDiscardReason, DiscardRow[]>();
    for (const discard of this.discards()) {
      if (!DISCARD_REASON_COPY[discard.reason]) continue;
      const rows = byReason.get(discard.reason) ?? [];
      rows.push({
        key: `${discard.packageName}|${discard.reason}`,
        appLabel: knownAppLabel(discard.packageName),
        packageName: discard.packageName,
        countLabel: discardCountLabel(discard.count),
        lastAtLabel: formatDateTime(discard.lastAt),
      });
      byReason.set(discard.reason, rows);
    }
    return REASON_ORDER.filter((reason) => byReason.has(reason)).map((reason) => ({
      reason,
      ...DISCARD_REASON_COPY[reason],
      rows: byReason.get(reason) ?? [],
    }));
  });
}
