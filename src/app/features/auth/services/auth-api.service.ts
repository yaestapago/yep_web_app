import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  AuthResponse,
  ForgotPasswordRequestCodeRequest,
  ForgotPasswordRequestCodeResponse,
  ForgotPasswordVerifyCodeRequest,
  ForgotPasswordVerifyCodeResponse,
  LoginRequest,
  MeResponse,
  RegisterRequest,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from '../../../shared/models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, request);
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, request);
  }

  me(): Observable<MeResponse> {
    return this.http.get<MeResponse>(`${this.apiUrl}/auth/me`);
  }

  requestPasswordResetCode(
    request: ForgotPasswordRequestCodeRequest,
  ): Observable<ForgotPasswordRequestCodeResponse> {
    return this.http.post<ForgotPasswordRequestCodeResponse>(
      `${this.apiUrl}/auth/forgot-password/request-code`,
      request,
    );
  }

  verifyPasswordResetCode(
    request: ForgotPasswordVerifyCodeRequest,
  ): Observable<ForgotPasswordVerifyCodeResponse> {
    return this.http.post<ForgotPasswordVerifyCodeResponse>(
      `${this.apiUrl}/auth/forgot-password/verify-code`,
      request,
    );
  }

  resetPassword(request: ResetPasswordRequest): Observable<ResetPasswordResponse> {
    return this.http.post<ResetPasswordResponse>(`${this.apiUrl}/auth/forgot-password/reset`, request);
  }
}
