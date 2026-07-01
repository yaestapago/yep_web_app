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
  departmentCode: string;
  departmentName: string;
  cityCode: string;
  cityName: string;
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
  departmentCode?: string;
  departmentName?: string;
  cityCode?: string;
  cityName?: string;
  address?: string;
  phone?: string;
}

export interface BusinessLookupResult {
  id: string;
  name: string;
  city: string;
}

export interface BusinessLookupResponse {
  businessAccounts: BusinessLookupResult[];
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

export interface AddBusinessMemberRequest {
  email?: string;
  identificationNumber?: string;
  role: BusinessMembershipRole;
}

export interface UpdateBusinessMemberRequest {
  role?: BusinessMembershipRole;
  locationIds?: string[];
}
