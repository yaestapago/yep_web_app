import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

import {
  canAccessBusinessSection,
  canViewDashboardIncomeTable,
} from '../../../core/constants/business-section-access';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { BillingStatusService } from '../../../core/services/billing-status.service';
import type { SourceEvent } from '../../../shared/models/source-event.models';
import { isMoneyReportEvent } from '../../../shared/utils/source-event-groups';
import { PaymentReportTracker } from './payment-report-tracker';
import { SourceEventsStreamService } from './source-events-stream.service';

const STORAGE_PREFIX = 'yep_web.payment_alerts.';

@Injectable({ providedIn: 'root' })
export class BrowserPaymentAlertsService {
  private readonly document = inject(DOCUMENT);
  private readonly view = this.document.defaultView;
  private readonly session = inject(AuthSessionService);
  private readonly billing = inject(BillingStatusService);
  private readonly injector = inject(Injector);
  private readonly storageVersion = signal(0);
  private readonly temporaryPreferences = new Map<string, boolean>();
  private readonly permission = signal(this.view?.Notification?.permission);

  private readonly userId = computed(() => this.session.user()?.id);
  private readonly optedIn = computed(() => {
    this.storageVersion();
    const userId = this.userId();
    return !!userId && this.readPreference(userId);
  });
  private readonly canReceive = computed(() => {
    const membership = this.session.activeMembership();
    const role = membership?.role;
    const access = membership?.sectionAccess;
    const isSuperUser = this.session.isSuperUser();
    return (
      !!this.session.accessToken() &&
      !this.billing.isBlocked() &&
      canAccessBusinessSection('dashboard', role, isSuperUser, access) &&
      canViewDashboardIncomeTable(role, isSuperUser, access)
    );
  });

  readonly enabled = computed(() => this.optedIn() && this.permission() === 'granted');

  constructor() {
    const refreshPermission = () => this.permission.set(this.view?.Notification?.permission);
    const refreshPreference = (event: StorageEvent) => {
      if (event.key === null || event.key === `${STORAGE_PREFIX}${this.userId()}`) {
        this.storageVersion.update((version) => version + 1);
      }
    };
    this.document.addEventListener('visibilitychange', refreshPermission);
    this.view?.addEventListener('storage', refreshPreference);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', refreshPermission);
      this.view?.removeEventListener('storage', refreshPreference);
    });

    effect((onCleanup) => {
      const userId = this.userId();
      const accountId = this.session.activeBusinessAccountId();
      if (!userId || !accountId || !this.enabled() || !this.canReceive()) return;

      const reports = new PaymentReportTracker((event) => this.show(event, userId, accountId));
      const stream = untracked(() => this.injector.get(SourceEventsStreamService));
      const subscription = stream.events$.subscribe((event) => {
        if (event.accountId === accountId && isMoneyReportEvent(event)) {
          reports.receive(event);
        }
      });
      onCleanup(() => {
        subscription.unsubscribe();
        reports.clear();
      });
    });
  }

  async setEnabled(on: boolean): Promise<'unsupported' | NotificationPermission | undefined> {
    const userId = this.userId();
    if (!userId) return;

    if (!on) {
      this.savePreference(userId, false);
      return;
    }

    const notificationApi = this.view?.Notification;
    if (!notificationApi || typeof notificationApi.requestPermission !== 'function') {
      return 'unsupported';
    }
    let permission = notificationApi.permission;
    if (permission === 'default') {
      try {
        permission = await notificationApi.requestPermission();
      } catch {
        return 'unsupported';
      }
    }
    this.permission.set(permission);
    if (this.userId() !== userId) return;
    if (permission !== 'granted') return permission;

    this.savePreference(userId, true);
    return permission;
  }

  private show(event: SourceEvent, userId: string, accountId: string): void {
    const view = this.view;
    if (
      !view ||
      view.Notification?.permission !== 'granted' ||
      !this.document.hidden ||
      !this.enabled() ||
      !this.canReceive() ||
      this.userId() !== userId ||
      this.session.activeBusinessAccountId() !== accountId
    ) {
      return;
    }

    try {
      const notification = new view.Notification('Pago recibido', {
        body: 'Vuelve a YEP para ver el pago.',
        icon: '/brand/ico.ico',
        silent: true,
        tag: `yep-payment:${accountId}:${event.linkedTransactionId ?? event.id}`,
      });
      notification.onclick = () => {
        view.focus();
        notification.close();
      };
    } catch {
      // Algunos navegadores (p. ej. en móvil) exponen la API sin permitir este tipo de aviso.
    }
  }

  private readPreference(userId: string): boolean {
    try {
      return (
        this.temporaryPreferences.get(userId) ??
        this.view?.localStorage.getItem(`${STORAGE_PREFIX}${userId}`) === '1'
      );
    } catch {
      return false;
    }
  }

  private savePreference(userId: string, enabled: boolean): void {
    try {
      this.view?.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, enabled ? '1' : '0');
      this.temporaryPreferences.delete(userId);
    } catch {
      this.temporaryPreferences.set(userId, enabled);
    }
    this.storageVersion.update((version) => version + 1);
  }
}
