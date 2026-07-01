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
  UpdateBusinessLocationRequest,
} from '../../../shared/models/bank-account.models';
import {
  AddBusinessMemberRequest,
  BusinessAccountDetailResponse,
  BusinessAccountRequest,
  BusinessAccountsResponse,
  BusinessLookupResponse,
  BusinessMembershipsResponse,
  CreateBusinessAccountResponse,
  MembershipRequest,
  MembershipResponse,
  UpdateBusinessAccountRequest,
  UpdateBusinessMemberRequest,
  UpdateMembershipStatusRequest,
} from '../../../shared/models/business-account.models';
import {
  ApprovedMembersResponse,
  SchedulesResponse,
  ShiftRequest,
  ShiftResponse,
  UpdateShiftRequest,
} from '../../../shared/models/schedule.models';

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

  // Resuelve un código corto (los últimos caracteres del ID del negocio) a los
  // negocios que coinciden, para unirse sin pegar el ID completo.
  lookupBusinessByCode(code: string): Observable<BusinessLookupResponse> {
    return this.http.get<BusinessLookupResponse>(`${this.apiUrl}/business-accounts/lookup`, {
      params: { code },
    });
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

  // Owner inbox: lists membership requests/memberships for a business account.
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

  listApprovedMembers(businessAccountId: string): Observable<ApprovedMembersResponse> {
    return this.http.get<ApprovedMembersResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/members`,
    );
  }

  addMember(
    businessAccountId: string,
    request: AddBusinessMemberRequest,
  ): Observable<MembershipResponse> {
    return this.http.post<MembershipResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/members`,
      request,
    );
  }

  updateMember(
    businessAccountId: string,
    membershipId: string,
    request: UpdateBusinessMemberRequest,
  ): Observable<MembershipResponse> {
    return this.http.patch<MembershipResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/memberships/${membershipId}`,
      request,
    );
  }

  listSchedules(businessAccountId: string): Observable<SchedulesResponse> {
    return this.http.get<SchedulesResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/schedules`,
    );
  }

  createShift(
    businessAccountId: string,
    request: ShiftRequest,
  ): Observable<ShiftResponse> {
    return this.http.post<ShiftResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/schedules`,
      request,
    );
  }

  updateShift(
    businessAccountId: string,
    shiftId: string,
    request: UpdateShiftRequest,
  ): Observable<ShiftResponse> {
    return this.http.patch<ShiftResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/schedules/${shiftId}`,
      request,
    );
  }

  deleteShift(
    businessAccountId: string,
    shiftId: string,
  ): Observable<ShiftResponse> {
    return this.http.delete<ShiftResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/schedules/${shiftId}`,
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

  updateLocation(
    businessAccountId: string,
    locationId: string,
    request: UpdateBusinessLocationRequest,
  ): Observable<BusinessLocationResponse> {
    return this.http.patch<BusinessLocationResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/locations/${locationId}`,
      request,
    );
  }

  deleteLocation(
    businessAccountId: string,
    locationId: string,
  ): Observable<BusinessLocationResponse> {
    return this.http.delete<BusinessLocationResponse>(
      `${this.apiUrl}/business-accounts/${businessAccountId}/locations/${locationId}`,
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
