import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  AuthResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  ForgotPasswordRequestCodeRequest,
  ForgotPasswordRequestCodeResponse,
  ForgotPasswordVerifyCodeRequest,
  ForgotPasswordVerifyCodeResponse,
  LoginRequest,
  MeResponse,
  RegisterRequestCodeRequest,
  RegisterRequestCodeResponse,
  RegisterRequest,
  ResetPasswordRequest,
  ResetPasswordResponse,
  UpdateGeneralPreferencesRequest,
  UpdateNotificationPreferencesRequest,
  UpdateProfileRequest,
  UserResponse,
} from '../../../shared/models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, request);
  }

  requestRegistrationVerificationCode(
    request: RegisterRequestCodeRequest,
  ): Observable<RegisterRequestCodeResponse> {
    return this.http.post<RegisterRequestCodeResponse>(
      `${this.apiUrl}/auth/register/request-code`,
      request,
    );
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, request);
  }

  me(): Observable<MeResponse> {
    return this.http.get<MeResponse>(`${this.apiUrl}/auth/me`);
  }

  updateProfile(request: UpdateProfileRequest): Observable<UserResponse> {
    return this.http.patch<UserResponse>(`${this.apiUrl}/auth/me`, request);
  }

  changePassword(request: ChangePasswordRequest): Observable<ChangePasswordResponse> {
    return this.http.post<ChangePasswordResponse>(`${this.apiUrl}/auth/me/password`, request);
  }

  updateNotificationPreferences(
    request: UpdateNotificationPreferencesRequest,
  ): Observable<UserResponse> {
    return this.http.patch<UserResponse>(
      `${this.apiUrl}/auth/me/notification-preferences`,
      request,
    );
  }

  updateGeneralPreferences(request: UpdateGeneralPreferencesRequest): Observable<UserResponse> {
    return this.http.patch<UserResponse>(`${this.apiUrl}/auth/me/general-preferences`, request);
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
    return this.http.post<ResetPasswordResponse>(
      `${this.apiUrl}/auth/forgot-password/reset`,
      request,
    );
  }
}
