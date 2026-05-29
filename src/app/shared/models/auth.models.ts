export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  identificationNumber: string;
  cellphoneNumber: string;
  globalRole?: 'account_su';
}

export type BusinessMembershipRole = 'account_owner' | 'account_staff';
export type BusinessMembershipStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface BusinessAccount {
  id: string;
  name: string;
  city: string;
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
