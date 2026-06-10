import {
  BusinessAccount,
  BusinessMembership,
  BusinessMembershipRole,
  BusinessMembershipStatus,
} from './auth.models';

export interface BusinessAccountsResponse {
  businessAccounts: BusinessAccount[];
}

export interface BusinessMembershipsResponse {
  memberships: BusinessMembership[];
}

export interface BusinessAccountRequest {
  name: string;
  city: string;
  address: string;
  phone: string;
}

export interface CreateBusinessAccountResponse {
  businessAccount: BusinessAccount;
  membership: BusinessMembership;
}

export interface BusinessAccountDetailResponse {
  businessAccount: BusinessAccount;
}

export interface UpdateBusinessAccountRequest {
  name?: string;
  city?: string;
  address?: string;
  phone?: string;
}

export interface MembershipRequest {
  businessAccountId: string;
  role: BusinessMembershipRole;
}

export interface MembershipResponse {
  membership: BusinessMembership;
}

export interface UpdateMembershipStatusRequest {
  status: Extract<BusinessMembershipStatus, 'approved' | 'rejected' | 'revoked'>;
}
