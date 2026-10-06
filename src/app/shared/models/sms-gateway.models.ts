/** Celular receptor del respaldo por SMS (sms-gate.app), visto por superadmin. */
export interface SmsGatewayStatus {
  id: string;
  deviceId: string;
  phoneNumber: string | null;
  lastPingAt: string | null;
  lastSmsAt: string | null;
  lastEventAt: string | null;
  lastEvent: string | null;
  /** Resultado del último SMS (`accepted`, `duplicate`, `bad_mac`…). */
  lastResult: string | null;
  smsCount: number;
  acceptedCount: number;
  lastError: string | null;
  lastErrorAt: string | null;
  /** Más de 15 min sin `system:ping`. */
  stale: boolean;
}

/** Banderas de configuración del respaldo (nunca los secretos). */
export interface SmsRelayConfigFlags {
  switchedOn: boolean;
  globallyAvailable: boolean;
  masterKeyConfigured: boolean;
  gatewayNumbers: string[];
  webhookTokenConfigured: boolean;
  signingKeysConfigured: number;
  staleAfterMinutes: number;
}

export interface SmsGatewaysResponse {
  gateways: SmsGatewayStatus[];
  relay: SmsRelayConfigFlags;
}
