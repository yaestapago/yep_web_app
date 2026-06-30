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

export type BusinessMembershipRole = 'account_owner' | 'account_staff';
export type BusinessMembershipStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

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
  requestedByUserId?: string;
  invitedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
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
