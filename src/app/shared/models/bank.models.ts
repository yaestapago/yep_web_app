/** Catálogo de bancos expuesto por el backend para el selector de cuentas. */
export interface BankPickerEntry {
  code: string;
  name: string;
  phone: { enabled: boolean };
  email: { enabled: boolean };
}

export interface BanksResponse {
  banks: BankPickerEntry[];
}

/**
 * Config técnica de un canal de detección (phone/email) de un banco. Define qué
 * escucha/evita la flota: `packageNames` = apps a escuchar; `contentPatterns` =
 * si hay, solo pasan los mensajes que contengan alguno (allowlist); vacío = pasa
 * todo lo de esas apps. `displayNames` = señal para escritorio (Vínculo Windows).
 */
export interface BankChannelConfig {
  enabled: boolean;
  packageNames: string[];
  contentPatterns: string[];
  displayNames: string[];
}

/** Banco del catálogo global con su config completa (vista de superadmin). */
export interface AdminBank {
  code: string;
  name: string;
  isActive: boolean;
  phone: BankChannelConfig;
  email: BankChannelConfig;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminBanksResponse {
  banks: AdminBank[];
}

export interface AdminBankResponse {
  bank: AdminBank;
}

export interface CreateBankRequest {
  code: string;
  name: string;
  isActive?: boolean;
  phone?: Partial<BankChannelConfig>;
  email?: Partial<BankChannelConfig>;
}

/** El `code` es inmutable, por eso se omite del patch de actualización. */
export type UpdateBankRequest = Partial<Omit<CreateBankRequest, 'code'>>;
