import type { BankAccount } from './bank-account.models';

export type NotifierType = 'phone_app' | 'email_gmail' | 'desktop_app';
export type NotifierIdentifierType = 'phone' | 'email';

/** Opciones de tipo mostradas como radio buttons al crear un notificador. */
export type NotifierKind = 'phone' | 'email' | 'desktop';

export interface NotifierPairedDevice {
  deviceId: string;
  model?: string;
  manufacturer?: string;
  osVersion?: string;
  appVersion?: string;
  pairedAt: string;
}

export interface NotifierDeviceHistoryEntry extends NotifierPairedDevice {
  unpairedAt?: string;
}

export interface Notifier {
  id: string;
  accountId: string;
  type: NotifierType;
  displayName?: string;
  identifier?: string;
  identifierType?: NotifierIdentifierType;
  bankIds: string[];
  bankAccountIds: string[];
  bankAccounts: BankAccount[];
  watchedPackages: string[];
  locationId?: string;
  active: boolean;
  pairingVersion: number;
  pairedDevice: NotifierPairedDevice | null;
  deviceHistory: NotifierDeviceHistoryEntry[];
  lastSeenAt?: string;
  lastLoginAt?: string;
  isOnline: boolean;
  accessCode?: string;
  /** Solo `email_gmail`: etiqueta única del alias de correo entrante. */
  inboundTag?: string;
  /** Solo `email_gmail`: alias completo (`buzón+tag@gmail.com`) al que reenviar. */
  inboundAlias?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotifiersResponse {
  notifiers: Notifier[];
}

export interface NotifierResponse {
  notifier: Notifier;
}

export interface DeleteNotifierResponse {
  deleted: boolean;
  id: string;
}

export interface CreateNotifierRequest {
  type?: NotifierType;
  displayName?: string;
  identifier?: string;
  identifierType?: NotifierIdentifierType;
  bankIds?: string[];
  bankAccountIds?: string[];
  watchedPackages?: string[];
  locationId?: string;
}

export interface UpdateNotifierRequest extends CreateNotifierRequest {
  active?: boolean;
}
