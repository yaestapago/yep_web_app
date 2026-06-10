import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  BankAccountResponse,
  BankAccountsResponse,
  BusinessLocationResponse,
  BusinessLocationsResponse,
  CreateBankAccountRequest,
  CreateBusinessLocationRequest,
  UpdateBankAccountRequest,
} from '../../../shared/models/bank-account.models';
import {
  BusinessAccountDetailResponse,
  BusinessAccountRequest,
  BusinessAccountsResponse,
  BusinessMembershipsResponse,
  CreateBusinessAccountResponse,
  MembershipRequest,
  MembershipResponse,
  UpdateBusinessAccountRequest,
  UpdateMembershipStatusRequest,
} from '../../../shared/models/business-account.models';

@Injectable({ providedIn: 'root' })
export class BusinessAccountsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listBusinessAccounts(): Observable<BusinessAccountsResponse> {
    return this.http.get<BusinessAccountsResponse>(`${this.apiUrl}/business-accounts`);
  }

  listMemberships(): Observable<BusinessMembershipsResponse> {
    return this.http.get<BusinessMembershipsResponse>(`${this.apiUrl}/business-accounts/memberships`);
  }

  createBusinessAccount(request: BusinessAccountRequest): Observable<CreateBusinessAccountResponse> {
    return this.http.post<CreateBusinessAccountResponse>(`${this.apiUrl}/business-accounts`, request);
  }

  requestMembership(request: MembershipRequest): Observable<MembershipResponse> {
    return this.http.post<MembershipResponse>(`${this.apiUrl}/business-accounts/membership-requests`, request);
  }

  updateBusinessAccount(
    businessAccountId: string,
    request: UpdateBusinessAccountRequest,
  ): Observable<BusinessAccountDetailResponse> {
    return this.http.patch<BusinessAccountDetailResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}`,
      request,
    );
  }

  // Backend pending: owner inbox endpoint does not exist yet.
  // Expected contract:
  // GET /business-accounts/:businessAccountId/membership-requests?status=pending
  // Response: { memberships: BusinessMembership[] }
  listPendingStaffRequests(businessAccountId: string): Observable<BusinessMembershipsResponse> {
    return this.http.get<BusinessMembershipsResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/membership-requests`,
      {
        params: { status: 'pending' },
      },
    );
  }

  updateMembershipStatus(
    businessAccountId: string,
    membershipId: string,
    request: UpdateMembershipStatusRequest,
  ): Observable<MembershipResponse> {
    return this.http.patch<MembershipResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/memberships/${membershipId}/status`,
      request,
    );
  }

  listLocations(businessAccountId: string): Observable<BusinessLocationsResponse> {
    return this.http.get<BusinessLocationsResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/locations`,
    );
  }

  createLocation(
    businessAccountId: string,
    request: CreateBusinessLocationRequest,
  ): Observable<BusinessLocationResponse> {
    return this.http.post<BusinessLocationResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/locations`,
      request,
    );
  }

  listBankAccounts(businessAccountId: string): Observable<BankAccountsResponse> {
    return this.http.get<BankAccountsResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/bank-accounts`,
    );
  }

  createBankAccount(
    businessAccountId: string,
    request: CreateBankAccountRequest,
  ): Observable<BankAccountResponse> {
    return this.http.post<BankAccountResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/bank-accounts`,
      request,
    );
  }

  updateBankAccount(
    businessAccountId: string,
    bankAccountId: string,
    request: UpdateBankAccountRequest,
  ): Observable<BankAccountResponse> {
    return this.http.patch<BankAccountResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/bank-accounts/${bankAccountId}`,
      request,
    );
  }

  deactivateBankAccount(
    businessAccountId: string,
    bankAccountId: string,
  ): Observable<BankAccountResponse> {
    return this.http.delete<BankAccountResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/bank-accounts/${bankAccountId}`,
    );
  }
}
