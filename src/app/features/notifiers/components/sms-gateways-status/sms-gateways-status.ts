import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideRefreshCw } from '@lucide/angular';
import { finalize } from 'rxjs';

import type {
  SmsGatewayStatus,
  SmsGatewaysResponse,
} from '../../../../shared/models/sms-gateway.models';
import { StatusDot } from '../../../../shared/ui/status-dot/status-dot';
import { formatDateTime } from '../../../../shared/utils/billing-format';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import type { NotifierStatusLevel } from '../../../../shared/utils/notifier-status';
import { SmsGatewaysAdminApiService } from '../../services/sms-gateways-admin-api.service';

/** Resultado del último SMS en palabras (los demás se muestran tal cual). */
const RESULT_LABELS: Record<string, string> = {
  accepted: 'aceptado',
  duplicate: 'duplicado',
  not_relay_format: 'no era de YEP',
  unknown_version: 'versión desconocida',
  bad_number: 'cabecera inválida',
  empty_message: 'vacío',
  unknown_nid: 'notificador desconocido',
  notifier_inactive: 'notificador inactivo',
  relay_disabled: 'sin llave maestra',
  bad_mac: 'firma inválida',
  stale: 'muy viejo',
  future: 'fecha futura',
  rate_limited: 'tope diario',
};

interface GatewayRow {
  id: string;
  title: string;
  level: NotifierStatusLevel;
  statusLabel: string;
  lastPing: string;
  lastSms: string;
  counts: string;
  lastResult: string;
  lastError: string;
}

export function gatewayRow(gateway: SmsGatewayStatus): GatewayRow {
  const level: NotifierStatusLevel = !gateway.lastPingAt
    ? 'unknown'
    : gateway.stale
      ? 'offline'
      : 'online';
  return {
    id: gateway.id,
    title: gateway.phoneNumber || `…${gateway.deviceId.slice(-8)}`,
    level,
    statusLabel:
      level === 'online' ? 'Reportando' : level === 'offline' ? 'Sin ping' : 'Sin ping aún',
    lastPing: gateway.lastPingAt ? formatDateTime(gateway.lastPingAt) : 'nunca',
    lastSms: gateway.lastSmsAt ? formatDateTime(gateway.lastSmsAt) : 'nunca',
    counts: `${gateway.acceptedCount.toLocaleString('es-CO')} aceptados de ${gateway.smsCount.toLocaleString('es-CO')} SMS`,
    lastResult: gateway.lastResult ? (RESULT_LABELS[gateway.lastResult] ?? gateway.lastResult) : '',
    lastError: gateway.lastError
      ? `${gateway.lastError}${gateway.lastErrorAt ? ` (${formatDateTime(gateway.lastErrorAt)})` : ''}`
      : '',
  };
}

/**
 * Bloque compacto "Receptores SMS" del panel de superadmin: si el respaldo por
 * SMS está encendido y, por cada celular receptor (sms-gate.app), su último
 * ping y su último SMS. Ver docs/operations/sms-gateway-setup.md del backend.
 */
@Component({
  selector: 'app-sms-gateways-status',
  imports: [StatusDot, LucideRefreshCw],
  templateUrl: './sms-gateways-status.html',
  styleUrl: './sms-gateways-status.scss',
})
export class SmsGatewaysStatus implements OnInit {
  private readonly api = inject(SmsGatewaysAdminApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly data = signal<SmsGatewaysResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly rows = computed(() => (this.data()?.gateways ?? []).map(gatewayRow));

  /** `Encendido · +57300…, +57310…` / `Apagado`. */
  readonly relayLabel = computed(() => {
    const relay = this.data()?.relay;
    if (!relay) return '';
    if (relay.globallyAvailable) {
      return `Encendido · ${relay.gatewayNumbers.join(', ')}`;
    }
    const missing: string[] = [];
    if (!relay.switchedOn) missing.push('SMS_RELAY_ENABLED');
    if (!relay.masterKeyConfigured) missing.push('llave maestra');
    if (relay.gatewayNumbers.length === 0) missing.push('números receptores');
    return `Apagado (falta: ${missing.join(', ')})`;
  });

  readonly webhookLabel = computed(() => {
    const relay = this.data()?.relay;
    if (!relay) return '';
    const parts = [
      relay.webhookTokenConfigured ? 'token' : 'sin token',
      relay.signingKeysConfigured > 0
        ? `${relay.signingKeysConfigured} llave(s) de firma`
        : 'sin llave de firma',
    ];
    return parts.join(' · ');
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .list()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.data.set(response),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }
}
