import { Injectable, computed, signal } from '@angular/core';

import { AuthResponse, User } from '../../shared/models/auth.models';

interface StoredSession {
  accessToken: string;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly storageKey = 'yep_web.auth_session';
  private readonly session = signal<StoredSession | null>(this.readStoredSession());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);
  readonly isAuthenticated = computed(() => Boolean(this.accessToken()));

  saveSession(response: AuthResponse): void {
    const session: StoredSession = {
      accessToken: response.accessToken,
      user: response.user,
    };

    this.session.set(session);
    localStorage.setItem(this.storageKey, JSON.stringify(session));
  }

  clearSession(): void {
    this.session.set(null);
    localStorage.removeItem(this.storageKey);
  }

  private readStoredSession(): StoredSession | null {
    try {
      const rawSession = localStorage.getItem(this.storageKey);
      return rawSession ? (JSON.parse(rawSession) as StoredSession) : null;
    } catch {
      localStorage.removeItem(this.storageKey);
      return null;
    }
  }
}
