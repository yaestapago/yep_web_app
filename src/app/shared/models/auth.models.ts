export interface NotificationPreferences {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  transactionAlerts: boolean;
  securityAlerts: boolean;
  marketing: boolean;
}

export interface GeneralPreferences {
  language: string;
  currency: string;
  dateFormat: string;
}

export interface UserPreferences {
  notifications: NotificationPreferences;
  general: GeneralPreferences;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  identificationNumber: string;
  cellphoneNumber: string;
  globalRole?: 'account_su';
  preferences?: UserPreferences;
}

export interface SubscriptionPlanSummary {
  id: string;
  code: string;
  name: string;
  priceCop: number;
  currency: string;
  billingPeriod: 'monthly';
  trialDays?: number;
  quotas: {
    maxBusinesses: number;
    maxLocations: number;
    maxMonthlySourceEventsVisible: number;
    maxMonthlyWhatsappNotifications: number;
    maxWhatsappRecipients: number;
    maxBankAccounts: number;
    maxMonthlyAiTransactionValidations: number;
  };
  retention: {
    sourceEventsDays: number;
  };
  features: {
    posIntegration: boolean;
    automaticComparison: boolean;
  };
  supportLevel: 'standard' | 'priority' | 'priority_plus';
  isCustom: boolean;
}

export interface UserSubscriptionSummary {
  id: string;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';
  plan: SubscriptionPlanSummary;
  startsAt: string;
  endsAt?: string;
  trialEndsAt?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

export type SubscriptionCreationMetric = 'businesses' | 'locations' | 'bankAccounts';

export interface SubscriptionUsageMetric {
  metric: string;
  label: string;
  used: number;
  limit: number;
  unit: string;
  percent: number;
  state: 'ok' | 'warning' | 'blocked';
}

export interface SubscriptionAlert {
  metric: string;
  severity: 'warning' | 'blocked';
  message: string;
}

export interface SubscriptionOverviewResponse {
  subscription: UserSubscriptionSummary | null;
  usage: SubscriptionUsageMetric[];
  alerts: SubscriptionAlert[];
  availablePlans: SubscriptionPlanSummary[];
}

export interface SubscriptionCreationPermissionResponse {
  allowed: boolean;
  metric: SubscriptionCreationMetric;
  planName: string;
  planCode: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  subscriptionUrl: string;
}

export type BusinessMembershipRole = 'account_owner' | 'account_staff';
export type BusinessMembershipStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface SourceEventAccess {
  enabled?: boolean;
  bankAccountIds: string[];
  allowedBreBKeys: string[];
}

export interface InvoiceReferencePreferences {
  label: string;
  required: boolean;
}

export interface BusinessAccountPreferences {
  invoiceReference?: InvoiceReferencePreferences;
}

export interface BusinessAccount {
  id: string;
  name: string;
  departmentCode: string;
  departmentName: string;
  cityCode: string;
  cityName: string;
  address: string;
  phone: string;
  slug?: string;
  preferences?: BusinessAccountPreferences;
  createdAt?: string;
  updatedAt?: string;
}

export interface BusinessMembership {
  id: string;
  businessAccountId: string;
  businessAccount?: BusinessAccount;
  userId?: string;
  email?: string;
  identificationNumber?: string;
  role: BusinessMembershipRole;
  status: BusinessMembershipStatus;
  locationIds: string[];
  sourceEventAccess?: SourceEventAccess;
  requestedByUserId?: string;
  invitedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
  subscription?: UserSubscriptionSummary | null;
  memberships: BusinessMembership[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  identificationNumber: string;
  cellphoneNumber: string;
  password: string;
  /** Omitido cuando SES está deshabilitado (ver MailStatusService). */
  verificationCode?: string;
  acceptedTerms: boolean;
  termsVersion: string;
}

export interface MailStatusResponse {
  enabled: boolean;
}

export interface RegisterRequestCodeRequest {
  email: string;
  identificationNumber: string;
  cellphoneNumber: string;
}

export interface RegisterRequestCodeResponse {
  message?: string;
  resendInSeconds?: number;
}

export interface ForgotPasswordRequestCodeRequest {
  email: string;
}

export interface ForgotPasswordRequestCodeResponse {
  message?: string;
  resendInSeconds?: number;
}

export interface ForgotPasswordVerifyCodeRequest {
  email: string;
  code: string;
}

export interface ForgotPasswordVerifyCodeResponse {
  resetToken: string;
  message?: string;
}

export interface ResetPasswordRequest {
  resetToken: string;
  password: string;
}

export interface ResetPasswordResponse {
  message?: string;
}

export interface MeResponse {
  user: User;
  subscription?: UserSubscriptionSummary | null;
  memberships: BusinessMembership[];
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  cellphoneNumber?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export type UpdateNotificationPreferencesRequest = Partial<NotificationPreferences>;

export type UpdateGeneralPreferencesRequest = Partial<GeneralPreferences>;

export interface UserResponse {
  user: User;
}

export interface ChangePasswordResponse {
  changed: boolean;
}
