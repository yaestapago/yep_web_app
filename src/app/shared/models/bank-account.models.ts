export type BankAccountType = 'savings' | 'checking' | 'wallet' | 'other';

export interface BusinessLocation {
  id: string;
  businessAccountId: string;
  name: string;
  city?: string;
  address?: string;
  phone?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BankAccount {
  id: string;
  bankId: string;
  accountNumberLast4: string;
  displayName?: string;
  holderName?: string;
  accountType?: BankAccountType;
  currency: string;
  locationIds: string[];
  isActive: boolean;
}

export interface BusinessLocationsResponse {
  locations: BusinessLocation[];
}

export interface BusinessLocationResponse {
  location: BusinessLocation;
}

export interface CreateBusinessLocationRequest {
  name: string;
  city?: string;
  address?: string;
  phone?: string;
  isActive?: boolean;
}

export type UpdateBusinessLocationRequest = Partial<CreateBusinessLocationRequest>;

export interface BankAccountsResponse {
  bankAccounts: BankAccount[];
}

export interface BankAccountResponse {
  bankAccount: BankAccount;
}

export interface CreateBankAccountRequest {
  bankId: string;
  accountNumber: string;
  locationIds: string[];
  displayName?: string;
  holderName?: string;
  accountType?: BankAccountType;
  currency?: string;
  isActive?: boolean;
}

export interface UpdateBankAccountRequest
  extends Partial<Omit<CreateBankAccountRequest, 'accountNumber'>> {
  accountNumber?: string;
}
