import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { BanksResponse } from '../../../shared/models/bank.models';

@Injectable({ providedIn: 'root' })
export class BanksApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(): Observable<BanksResponse> {
    return this.http.get<BanksResponse>(`${this.apiUrl}/banks`);
  }
}
