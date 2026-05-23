import { BusinessAccount, BusinessMembership, BusinessMembershipRole } from './auth.models';

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

export interface MembershipRequest {
  businessAccountId: string;
  role: BusinessMembershipRole;
}

export interface MembershipResponse {
  membership: BusinessMembership;
}
