import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import {
  LucideCircleAlert,
  LucideCircleCheck,
  LucideCircleHelp,
  LucideCircleX,
  LucideInfo,
  LucideLoaderCircle,
} from '@lucide/angular';

import { Button } from '../button/button';
import { Modal } from '../modal/modal';
import { NotificationModalService } from './notification-modal.service';

@Component({
  selector: 'yep-notification-modal',
  imports: [
    Button,
    Modal,
    LucideCircleAlert,
    LucideCircleCheck,
    LucideCircleHelp,
    LucideCircleX,
    LucideInfo,
    LucideLoaderCircle,
  ],
  templateUrl: './notification-modal.html',
  styleUrl: './notification-modal.scss',
})
export class NotificationModal implements OnDestroy {
  readonly notifications = inject(NotificationModalService);
  readonly state = this.notifications.state;
  readonly remainingSeconds = signal<number | null>(null);

  private countdownId: ReturnType<typeof setInterval> | null = null;

  readonly open = computed(() => this.state() !== null);
  readonly isLoading = computed(() => this.state()?.type === 'loading');
  readonly iconClass = computed(
    () => `notification-icon notification-icon--${this.state()?.type ?? 'info'}`,
  );

  constructor() {
    effect(() => {
      const seconds = this.state()?.countdownSeconds ?? null;
      this.stopCountdown();
      this.remainingSeconds.set(seconds);

      if (seconds === null || seconds <= 0) {
        return;
      }

      this.countdownId = setInterval(() => {
        this.remainingSeconds.update((current) => {
          if (current === null || current <= 1) {
            this.stopCountdown();
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    });
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  close(): void {
    if (this.state()?.closable) {
      this.notifications.close();
    }
  }

  primary(): void {
    this.notifications.resolve(true);
  }

  secondary(): void {
    this.notifications.resolve(false);
  }

  private stopCountdown(): void {
    if (this.countdownId) {
      clearInterval(this.countdownId);
      this.countdownId = null;
    }
  }
}
