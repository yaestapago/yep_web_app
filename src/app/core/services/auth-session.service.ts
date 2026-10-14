import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  BusinessAccount,
  BusinessMembership,
  UserSubscriptionSummary,
  User,
} from '../../shared/models/auth.models';

/**
 * Nombre del Web Lock que serializa `/auth/refresh` entre pestañas e iframes del mismo origen.
 * El backend rota el refresh token en cada uso y, si recibe uno ya rotado, lo trata como robo y
 * revoca todas las sesiones del usuario. Dos cargas simultáneas con la misma cookie cerraban la
 * sesión; con el lock la segunda espera y renueva con la cookie ya rotada.
 */
const REFRESH_LOCK_NAME = 'yep_web.auth_refresh';

interface StoredSession {
  accessToken: string | null;
  user: User;
  subscription?: UserSubscriptionSummary | null;
  memberships: BusinessMembership[];
  activeBusinessAccountId: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;
  private readonly storageKey = 'yep_web.auth_session';
  private readonly session = signal<StoredSession | null>(this.readStoredSession());
  /** Renovación en curso en esta pestaña: las llamadas simultáneas comparten la misma. */
  private refreshInFlight: Promise<AuthResponse> | null = null;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly subscription = computed(() => this.session()?.subscription ?? null);
  readonly memberships = computed(() => this.session()?.memberships ?? []);
  readonly approvedMemberships = computed(() =>
    this.memberships().filter((membership) => membership.status === 'approved'),
  );
  readonly pendingMemberships = computed(() =>
    this.memberships().filter((membership) => membership.status === 'pending'),
  );
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);
  readonly activeBusinessAccountId = computed(
    () => this.session()?.activeBusinessAccountId ?? null,
  );
  readonly activeMembership = computed(() => {
    const activeBusinessAccountId = this.activeBusinessAccountId();

    return activeBusinessAccountId
      ? (this.approvedMemberships().find(
          (membership) => membership.businessAccountId === activeBusinessAccountId,
        ) ?? null)
      : null;
  });
  readonly isAuthenticated = computed(() => Boolean(this.accessToken()));
  readonly onboardingRequired = computed(
    () => this.isAuthenticated() && this.approvedMemberships().length === 0,
  );
  /** Super-usuario global: puede administrar el catálogo de bancos, etc. */
  readonly isSuperUser = computed(() => this.user()?.globalRole === 'account_su');
  readonly isSupportUser = computed(() => this.user()?.globalRole === 'support');
  readonly isInternalOpsUser = computed(() => this.isSuperUser() || this.isSupportUser());

  saveSession(response: AuthResponse): void {
    const memberships = this.normalizeMemberships(response.memberships ?? []);
    const session: StoredSession = {
      accessToken: response.accessToken,
      user: response.user,
      subscription: response.subscription ?? null,
      memberships,
      activeBusinessAccountId: this.resolveActiveBusinessAccountId(
        memberships,
        this.activeBusinessAccountId(),
      ),
    };

    this.persist(session);
  }

  updateMemberships(memberships: BusinessMembership[]): void {
    const current = this.session();

    if (!current) {
      return;
    }

    const normalizedMemberships = this.normalizeMemberships(memberships);

    this.persist({
      ...current,
      memberships: normalizedMemberships,
      activeBusinessAccountId: this.resolveActiveBusinessAccountId(
        normalizedMemberships,
        current.activeBusinessAccountId,
      ),
    });
  }

  setActiveBusinessAccountId(businessAccountId: string): void {
    const current = this.session();

    if (!current) {
      return;
    }

    const approvedBusinessIds = new Set(
      current.memberships
        .filter((membership) => membership.status === 'approved')
        .map((membership) => membership.businessAccountId),
    );

    if (!approvedBusinessIds.has(businessAccountId)) {
      return;
    }

    this.persist({
      ...current,
      activeBusinessAccountId: businessAccountId,
    });
  }

  ensureActiveBusiness(): boolean {
    const current = this.session();

    if (!current) {
      return false;
    }

    const activeBusinessAccountId = this.resolveActiveBusinessAccountId(
      current.memberships,
      current.activeBusinessAccountId,
    );

    if (!activeBusinessAccountId) {
      this.persist({ ...current, activeBusinessAccountId: null });
      return false;
    }

    if (activeBusinessAccountId !== current.activeBusinessAccountId) {
      this.persist({ ...current, activeBusinessAccountId });
    }

    return true;
  }

  /** Actualiza el usuario en sesión (p. ej. tras editar perfil o preferencias). */
  updateUser(user: User): void {
    const current = this.session();

    if (!current) {
      return;
    }

    this.persist({
      ...current,
      user: { ...current.user, ...user },
    });
  }

  /** Actualiza el negocio anidado en las membresías (p. ej. tras editar sus datos). */
  updateSubscription(subscription: UserSubscriptionSummary | null): void {
    const current = this.session();

    if (!current) {
      return;
    }

    this.persist({
      ...current,
      subscription,
    });
  }

  patchBusinessAccount(account: BusinessAccount): void {
    const current = this.session();

    if (!current) {
      return;
    }

    this.persist({
      ...current,
      memberships: current.memberships.map((membership) =>
        membership.businessAccountId === account.id
          ? { ...membership, businessAccount: { ...membership.businessAccount, ...account } }
          : membership,
      ),
    });
  }

  /** Quita un negocio de las membresías locales (p. ej. tras eliminarlo). */
  removeMembership(businessAccountId: string): void {
    const current = this.session();

    if (!current) {
      return;
    }

    this.updateMemberships(
      current.memberships.filter(
        (membership) => membership.businessAccountId !== businessAccountId,
      ),
    );
  }

  clearSession(): void {
    this.session.set(null);
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Pide un access token nuevo con la cookie de refresh y guarda la sesión. Una sola renovación a
   * la vez: dentro de la pestaña se comparte la promesa y entre pestañas se espera el Web Lock.
   */
  refreshAccessToken(): Promise<AuthResponse> {
    this.refreshInFlight ??= this.withRefreshLock(() =>
      firstValueFrom(
        this.http.post<AuthResponse>(`${this.apiUrl}/auth/refresh`, {}, { withCredentials: true }),
      ),
    )
      .then((response) => {
        this.saveSession(response);
        return response;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    return this.refreshInFlight;
  }

  async restoreSession(): Promise<void> {
    try {
      await this.refreshAccessToken();
    } catch {
      if (!this.accessToken()) {
        this.clearSession();
      }
    }
  }

  private withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = globalThis.navigator?.locks;
    // Sin Web Locks (navegadores muy viejos, pruebas) se renueva sin coordinar pestañas.
    // `request` resuelve con lo que resuelve `task` (la promesa se aplana), aunque el tipo de la
    // librería DOM diga `Promise<Promise<T>>`.
    return locks ? (locks.request(REFRESH_LOCK_NAME, task) as unknown as Promise<T>) : task();
  }

  private persist(session: StoredSession): void {
    this.session.set(session);
    const { accessToken: _accessToken, ...storedSession } = session;
    localStorage.setItem(this.storageKey, JSON.stringify(storedSession));
  }

  private resolveActiveBusinessAccountId(
    memberships: BusinessMembership[],
    preferredBusinessAccountId?: string | null,
  ): string | null {
    const approvedMemberships = memberships.filter(
      (membership) => membership.status === 'approved',
    );

    if (
      approvedMemberships.some(
        (membership) => membership.businessAccountId === preferredBusinessAccountId,
      )
    ) {
      return preferredBusinessAccountId ?? null;
    }

    return approvedMemberships[0]?.businessAccountId ?? null;
  }

  private normalizeMemberships(memberships: BusinessMembership[]): BusinessMembership[] {
    const byBusinessId = new Map<string, BusinessMembership>();

    for (const membership of memberships) {
      const current = byBusinessId.get(membership.businessAccountId);

      if (!current || this.isPreferredMembership(membership, current)) {
        byBusinessId.set(membership.businessAccountId, membership);
      }
    }

    return [...byBusinessId.values()];
  }

  private isPreferredMembership(
    candidate: BusinessMembership,
    current: BusinessMembership,
  ): boolean {
    const candidateRank = this.membershipStatusRank(candidate);
    const currentRank = this.membershipStatusRank(current);

    if (candidateRank !== currentRank) {
      return candidateRank > currentRank;
    }

    const candidateRoleRank = this.membershipRoleRank(candidate);
    const currentRoleRank = this.membershipRoleRank(current);

    if (candidateRoleRank !== currentRoleRank) {
      return candidateRoleRank > currentRoleRank;
    }

    return this.membershipTimestamp(candidate) > this.membershipTimestamp(current);
  }

  private membershipStatusRank(membership: BusinessMembership): number {
    switch (membership.status) {
      case 'approved':
        return 4;
      case 'pending':
        return 3;
      case 'rejected':
        return 2;
      case 'revoked':
        return 1;
      default:
        return 0;
    }
  }

  private membershipTimestamp(membership: BusinessMembership): number {
    return Date.parse(membership.updatedAt ?? membership.createdAt ?? '') || 0;
  }

  private membershipRoleRank(membership: BusinessMembership): number {
    return membership.role === 'account_owner' ? 2 : 1;
  }

  private readStoredSession(): StoredSession | null {
    try {
      const rawSession = localStorage.getItem(this.storageKey);
      if (!rawSession) {
        return null;
      }

      const stored = JSON.parse(rawSession) as Partial<StoredSession>;

      if (!stored.user) {
        return null;
      }

      const memberships = this.normalizeMemberships(stored.memberships ?? []);

      return {
        accessToken: stored.accessToken ?? null,
        user: stored.user,
        subscription: stored.subscription ?? null,
        memberships,
        activeBusinessAccountId: this.resolveActiveBusinessAccountId(
          memberships,
          stored.activeBusinessAccountId,
        ),
      };
    } catch {
      localStorage.removeItem(this.storageKey);
      return null;
    }
  }
}
