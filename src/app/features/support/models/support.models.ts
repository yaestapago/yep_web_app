export interface SupportPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface SupportListResponse<T> {
  items: T[];
  pagination: SupportPagination;
}

export interface SupportUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  identificationNumber: string;
  cellphoneNumber: string;
  globalRole?: 'account_su' | 'support';
  isActive: boolean;
  createdAt: string;
}

export interface SupportBusiness {
  id: string;
  name: string;
  slug?: string;
  cityName: string;
  departmentName: string;
  address: string;
  phone: string;
  createdAt: string;
}

export interface SupportBusinessDetail {
  business: SupportBusiness;
  counts: { members: number; customers: number; events: number };
  subscription: SupportBusinessSubscription;
}

export interface SupportBusinessSubscription {
  state: 'available' | 'not_found';
  owner?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    identificationNumber: string;
    isActive: boolean;
  };
  ownerCount?: number;
  subscription?: UserSubscriptionSummary | null;
  warnings: string[];
}

export type SupportResource = 'members' | 'bank-accounts' | 'customers' | 'source-events';
export type SupportRecord = Record<string, unknown> & { id: string; createdAt?: string };
import type { UserSubscriptionSummary } from '../../../shared/models/auth.models';
