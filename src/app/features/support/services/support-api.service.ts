import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  SupportBusiness,
  SupportBusinessDetail,
  SupportListResponse,
  SupportRecord,
  SupportResource,
  SupportUser,
} from '../models/support.models';

@Injectable({ providedIn: 'root' })
export class SupportApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin/support`;

  listUsers(search = '', page = 1): Observable<SupportListResponse<SupportUser>> {
    return this.http.get<SupportListResponse<SupportUser>>(`${this.baseUrl}/users`, {
      params: this.params(search, page),
    });
  }

  listBusinesses(search = '', page = 1): Observable<SupportListResponse<SupportBusiness>> {
    return this.http.get<SupportListResponse<SupportBusiness>>(`${this.baseUrl}/businesses`, {
      params: this.params(search, page),
    });
  }

  getBusiness(id: string): Observable<SupportBusinessDetail> {
    return this.http.get<SupportBusinessDetail>(`${this.baseUrl}/businesses/${id}`);
  }

  listBusinessResource(
    businessId: string,
    resource: SupportResource,
    search = '',
    page = 1,
  ): Observable<SupportListResponse<SupportRecord>> {
    return this.http.get<SupportListResponse<SupportRecord>>(
      `${this.baseUrl}/businesses/${businessId}/${resource}`,
      { params: this.params(search, page) },
    );
  }

  private params(search: string, page: number): HttpParams {
    let params = new HttpParams().set('page', page).set('limit', 25);
    if (search.trim()) params = params.set('search', search.trim());
    return params;
  }
}
