export type NotificationSource = 'web' | 'mobile' | 'whatsapp' | 'api';

export interface NotificationPayload {
  id?: string | number;
  notification?: {
    title?: string;
    message?: string;
    source?: NotificationSource;
  };
  [key: string]: unknown;
}

export interface YepNotification {
  id: string;
  accountId: string;
  source: NotificationSource;
  externalId: string;
  rawPayload: NotificationPayload;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsResponse {
  notifications: YepNotification[];
}
