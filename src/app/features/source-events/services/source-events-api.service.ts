import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  IngestSourceEventRequest,
  SourceEvent,
  SourceEventsResponse,
} from '../../../shared/models/source-event.models';

@Injectable({ providedIn: 'root' })
export class SourceEventsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(): Observable<SourceEventsResponse> {
    return this.http.get<SourceEventsResponse>(`${this.apiUrl}/source-events`);
  }

  get(id: string): Observable<{ sourceEvent: SourceEvent }> {
    return this.http.get<{ sourceEvent: SourceEvent }>(`${this.apiUrl}/source-events/${id}`);
  }

  ingest(request: IngestSourceEventRequest): Observable<SourceEvent> {
    return this.http.post<SourceEvent>(`${this.apiUrl}/source-events`, request);
  }
}
