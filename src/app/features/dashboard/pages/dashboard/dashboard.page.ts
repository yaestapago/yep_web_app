import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideBell,
  LucideBellDot,
  LucideLoaderCircle,
  LucideRefreshCw,
  LucideShieldCheck,
  LucideTriangleAlert,
} from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { YepNotification } from '../../../../shared/models/notification.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { NotificationsApiService } from '../../../notifications/services/notifications-api.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    DatePipe,
    LucideBell,
    LucideBellDot,
    LucideLoaderCircle,
    LucideRefreshCw,
    LucideShieldCheck,
    LucideTriangleAlert,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage implements OnInit {
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = inject(AuthSessionService).user;
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notifications = signal<YepNotification[]>([]);
  readonly totalNotifications = computed(() => this.notifications().length);
  readonly sources = computed(() => new Set(this.notifications().map((notification) => notification.source)).size);

  ngOnInit(): void {
    this.loadNotifications();
  }

  loadNotifications(): void {
    this.loading.set(true);
    this.error.set('');

    this.notificationsApi
      .getNotifications()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.notifications.set(response.notifications),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  title(notification: YepNotification): string {
    return notification.rawPayload.notification?.title ?? `Notificacion ${notification.externalId}`;
  }

  message(notification: YepNotification): string {
    return notification.rawPayload.notification?.message ?? 'Payload recibido por el backend.';
  }
}
