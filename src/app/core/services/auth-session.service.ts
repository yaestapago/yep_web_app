import { Injectable, computed, signal } from '@angular/core';

import { AuthResponse, BusinessAccount, BusinessMembership, User } from '../../shared/models/auth.models';

interface StoredSession {
  accessToken: string;
  user: User;
  memberships: BusinessMembership[];
  activeBusinessAccountId: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly storageKey = 'yep_web.auth_session';
  private readonly session = signal<StoredSession | null>(this.readStoredSession());

  readonly user = computed(() => this.session()?.user ?? null);
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

  saveSession(response: AuthResponse): void {
    const memberships = this.normalizeMemberships(response.memberships ?? []);
    const session: StoredSession = {
      accessToken: response.accessToken,
      user: response.user,
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

  clearSession(): void {
    this.session.set(null);
    localStorage.removeItem(this.storageKey);
  }

  private persist(session: StoredSession): void {
    this.session.set(session);
    localStorage.setItem(this.storageKey, JSON.stringify(session));
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

      if (!stored.accessToken || !stored.user) {
        return null;
      }

      const memberships = this.normalizeMemberships(stored.memberships ?? []);

      return {
        accessToken: stored.accessToken,
        user: stored.user,
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
