import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { Customer, CustomerSort, CustomersResponse } from '../../../shared/models/customer.models';
import { TransactionsResponse } from '../../../shared/models/transaction.models';

@Injectable({ providedIn: 'root' })
export class CustomersApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(sortBy: CustomerSort = 'lastSeenAt', limit = 50): Observable<CustomersResponse> {
    const params = new HttpParams().set('sortBy', sortBy).set('limit', limit);

    return this.http.get<CustomersResponse>(`${this.apiUrl}/customers`, { params });
  }

  get(id: string): Observable<{ customer: Customer }> {
    return this.http.get<{ customer: Customer }>(`${this.apiUrl}/customers/${id}`);
  }

  listTransactions(id: string): Observable<TransactionsResponse> {
    return this.http.get<TransactionsResponse>(`${this.apiUrl}/customers/${id}/transactions`);
  }
}
