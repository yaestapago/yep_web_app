import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  CreateNotifierRequest,
  NotifierResponse,
  NotifiersResponse,
  UpdateNotifierRequest,
} from '../../../shared/models/notifier.models';

@Injectable({ providedIn: 'root' })
export class NotifiersApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(): Observable<NotifiersResponse> {
    return this.http.get<NotifiersResponse>(`${this.apiUrl}/notifiers`);
  }

  get(id: string): Observable<NotifierResponse> {
    return this.http.get<NotifierResponse>(`${this.apiUrl}/notifiers/${id}`);
  }

  create(request: CreateNotifierRequest): Observable<NotifierResponse> {
    return this.http.post<NotifierResponse>(`${this.apiUrl}/notifiers`, request);
  }

  update(id: string, request: UpdateNotifierRequest): Observable<NotifierResponse> {
    return this.http.patch<NotifierResponse>(`${this.apiUrl}/notifiers/${id}`, request);
  }

  remove(id: string): Observable<NotifierResponse> {
    return this.http.delete<NotifierResponse>(`${this.apiUrl}/notifiers/${id}`);
  }

  activate(id: string): Observable<NotifierResponse> {
    return this.http.post<NotifierResponse>(`${this.apiUrl}/notifiers/${id}/activate`, {});
  }

  deactivate(id: string): Observable<NotifierResponse> {
    return this.http.post<NotifierResponse>(`${this.apiUrl}/notifiers/${id}/deactivate`, {});
  }

  unpair(id: string): Observable<NotifierResponse> {
    return this.http.post<NotifierResponse>(`${this.apiUrl}/notifiers/${id}/unpair`, {});
  }
}
