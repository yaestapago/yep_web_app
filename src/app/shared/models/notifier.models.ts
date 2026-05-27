export type NotifierType = 'phone_app' | 'email_gmail';
export type NotifierIdentifierType = 'phone' | 'email';

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
  createdAt: string;
  updatedAt: string;
}

export interface NotifiersResponse {
  notifiers: Notifier[];
}

export interface NotifierResponse {
  notifier: Notifier;
}

export interface CreateNotifierRequest {
  displayName?: string;
  identifier?: string;
  identifierType?: NotifierIdentifierType;
  bankIds?: string[];
  watchedPackages?: string[];
  locationId?: string;
}

export interface UpdateNotifierRequest extends CreateNotifierRequest {
  active?: boolean;
}
