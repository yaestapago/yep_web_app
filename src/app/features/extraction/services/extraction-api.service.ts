import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { TransactionExtractionResponse } from '../../../shared/models/extraction.models';

@Injectable({ providedIn: 'root' })
export class ExtractionApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  extractReceipt(image: File): Observable<TransactionExtractionResponse> {
    const formData = new FormData();
    formData.append('image', image);

    return this.http.post<TransactionExtractionResponse>(`${this.apiUrl}/extraction/ocr`, formData);
  }
}
