import { Injectable, signal } from '@angular/core';

export type NotificationTone = 'info' | 'success' | 'warning' | 'error' | 'question';
export type NotificationVariant = NotificationTone | 'loading';

export interface NotificationModalOptions {
  title: string;
  message?: string | string[];
  type?: NotificationVariant;
  confirmText?: string;
  cancelText?: string;
  closable?: boolean;
  showCancel?: boolean;
  progress?: boolean;
  countdownSeconds?: number;
}

export interface NotificationLoadingRef {
  close: () => void;
  update: (options: Partial<NotificationModalOptions>) => void;
}

interface NotificationState extends Required<Pick<NotificationModalOptions, 'title'>> {
  id: number;
  type: NotificationVariant;
  message: string[];
  confirmText: string;
  cancelText: string;
  closable: boolean;
  showCancel: boolean;
  progress: boolean;
  countdownSeconds: number | null;
  resolve?: (value: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class NotificationModalService {
  private nextId = 0;
  private readonly currentState = signal<NotificationState | null>(null);

  readonly state = this.currentState.asReadonly();

  info(options: NotificationModalOptions): Promise<void> {
    return this.alert({ ...options, type: 'info' });
  }

  success(options: NotificationModalOptions): Promise<void> {
    return this.alert({ ...options, type: 'success' });
  }

  warning(options: NotificationModalOptions): Promise<void> {
    return this.alert({ ...options, type: 'warning' });
  }

  error(options: NotificationModalOptions): Promise<void> {
    return this.alert({ ...options, type: 'error' });
  }

  alert(options: NotificationModalOptions): Promise<void> {
    return this.open({
      ...options,
      type: options.type === 'loading' ? 'info' : (options.type ?? 'info'),
      showCancel: false,
      confirmText: options.confirmText ?? 'Aceptar',
    }).then(() => undefined);
  }

  confirm(options: NotificationModalOptions): Promise<boolean> {
    return this.open({
      ...options,
      type: options.type ?? 'question',
      showCancel: options.showCancel ?? true,
      confirmText: options.confirmText ?? 'Confirmar',
      cancelText: options.cancelText ?? 'Cancelar',
    });
  }

  loading(options: NotificationModalOptions): NotificationLoadingRef {
    const id = this.nextId++;
    this.currentState.set(
      this.buildState(id, {
        ...options,
        type: 'loading',
        closable: options.closable ?? false,
        confirmText: options.confirmText ?? '',
        showCancel: false,
        progress: options.progress ?? true,
      }),
    );

    return {
      close: () => this.closeById(id),
      update: (next) => this.updateById(id, next),
    };
  }

  resolve(value: boolean): void {
    const state = this.currentState();
    state?.resolve?.(value);
    this.currentState.set(null);
  }

  close(): void {
    const state = this.currentState();
    state?.resolve?.(false);
    this.currentState.set(null);
  }

  private open(options: NotificationModalOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.currentState.set(this.buildState(id, options, resolve));
    });
  }

  private buildState(
    id: number,
    options: NotificationModalOptions,
    resolve?: (value: boolean) => void,
  ): NotificationState {
    return {
      id,
      title: options.title,
      type: options.type ?? 'info',
      message: Array.isArray(options.message)
        ? options.message
        : options.message
          ? [options.message]
          : [],
      confirmText: options.confirmText ?? 'Aceptar',
      cancelText: options.cancelText ?? 'Cancelar',
      closable: options.closable ?? true,
      showCancel: options.showCancel ?? false,
      progress: options.progress ?? false,
      countdownSeconds: options.countdownSeconds ?? null,
      resolve,
    };
  }

  private closeById(id: number): void {
    if (this.currentState()?.id === id) {
      this.currentState.set(null);
    }
  }

  private updateById(id: number, options: Partial<NotificationModalOptions>): void {
    const current = this.currentState();
    if (!current || current.id !== id) {
      return;
    }
    this.currentState.set({
      ...current,
      title: options.title ?? current.title,
      type: options.type ?? current.type,
      message:
        options.message === undefined
          ? current.message
          : Array.isArray(options.message)
            ? options.message
            : [options.message],
      confirmText: options.confirmText ?? current.confirmText,
      cancelText: options.cancelText ?? current.cancelText,
      closable: options.closable ?? current.closable,
      showCancel: options.showCancel ?? current.showCancel,
      progress: options.progress ?? current.progress,
      countdownSeconds: options.countdownSeconds ?? current.countdownSeconds,
    });
  }
}
