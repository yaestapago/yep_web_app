import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  AttachSupportRequest,
  AttachSupportResponse,
  CreateTransactionRequest,
  CreateTransactionResponse,
  PaymentSupportsResponse,
  TransactionQuery,
  TransactionResponse,
  TransactionsResponse,
} from '../../../shared/models/transaction.models';

@Injectable({ providedIn: 'root' })
export class TransactionsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(query: TransactionQuery = {}): Observable<TransactionsResponse> {
    return this.http.get<TransactionsResponse>(`${this.apiUrl}/transactions`, {
      params: this.toParams(query),
    });
  }

  get(id: string): Observable<TransactionResponse> {
    return this.http.get<TransactionResponse>(`${this.apiUrl}/transactions/${id}`);
  }

  create(request: CreateTransactionRequest): Observable<CreateTransactionResponse> {
    return this.http.post<CreateTransactionResponse>(`${this.apiUrl}/transactions`, request);
  }

  listSupports(transactionId: string): Observable<PaymentSupportsResponse> {
    return this.http.get<PaymentSupportsResponse>(`${this.apiUrl}/transactions/${transactionId}/supports`);
  }

  attachSupport(
    transactionId: string,
    request: AttachSupportRequest,
  ): Observable<AttachSupportResponse> {
    return this.http.post<AttachSupportResponse>(
      `${this.apiUrl}/transactions/${transactionId}/supports`,
      request,
    );
  }

  runVerification(transactionId: string, mechanismKind?: string): Observable<TransactionResponse> {
    const params = mechanismKind ? new HttpParams().set('mechanismKind', mechanismKind) : undefined;

    return this.http.post<TransactionResponse>(
      `${this.apiUrl}/transactions/${transactionId}/verifications/run`,
      {},
      { params },
    );
  }

  private toParams(query: TransactionQuery): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return params;
  }
}
