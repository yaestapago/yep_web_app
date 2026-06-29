import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CitiesResponse, DepartmentsResponse } from '../models/geo.models';

@Injectable({ providedIn: 'root' })
export class GeoApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listDepartments(): Observable<DepartmentsResponse> {
    return this.http.get<DepartmentsResponse>(`${this.apiUrl}/geo/departments`);
  }

  listCities(departmentCode: string): Observable<CitiesResponse> {
    return this.http.get<CitiesResponse>(`${this.apiUrl}/geo/departments/${departmentCode}/cities`);
  }
}
