import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  IngestSourceEventRequest,
  SourceEvent,
  SourceEventResponse,
  SourceEventQuery,
  SourceEventsResponse,
} from '../../../shared/models/source-event.models';

@Injectable({ providedIn: 'root' })
export class SourceEventsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(query: SourceEventQuery = {}): Observable<SourceEventsResponse> {
    return this.http.get<SourceEventsResponse>(`${this.apiUrl}/source-events`, {
      params: this.toParams(query),
    });
  }

  get(id: string): Observable<SourceEventResponse> {
    return this.http.get<SourceEventResponse>(`${this.apiUrl}/source-events/${id}`);
  }

  ingest(request: IngestSourceEventRequest): Observable<SourceEvent> {
    return this.http.post<SourceEvent>(`${this.apiUrl}/source-events`, request);
  }

  private toParams(query: SourceEventQuery): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, Array.isArray(value) ? value.join(',') : String(value));
      }
    }

    return params;
  }
}
