import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  BusinessAccountRequest,
  BusinessAccountsResponse,
  BusinessMembershipsResponse,
  CreateBusinessAccountResponse,
  MembershipRequest,
  MembershipResponse,
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
}
