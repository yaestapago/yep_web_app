export interface NotificationRoutingRule {
  id: string;
  accountId: string;
  bankId: string;
  bankAccountIds: string[];
  breBKeys: string[];
  recipientPhone: string;
  recipientUserId?: string;
  locationId?: string;
  priority: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationRoutingRequest {
  bankId: string;
  bankAccountIds?: string[];
  breBKeys?: string[];
  recipientPhone: string;
  recipientUserId?: string;
  locationId?: string;
  priority?: number;
}

export type UpdateNotificationRoutingRequest =
  Partial<CreateNotificationRoutingRequest>;

export interface NotificationRoutingRulesResponse {
  rules: NotificationRoutingRule[];
}

export interface NotificationRoutingRuleResponse {
  rule: NotificationRoutingRule;
}

export interface DeleteNotificationRoutingResponse {
  deleted: boolean;
  id: string;
}
