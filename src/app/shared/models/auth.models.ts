export interface User {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  accountName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface MeResponse {
  user: User;
}
