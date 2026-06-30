import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  LucideCalendarClock,
  LucideClipboardCheck,
  LucideClipboardCopy,
  LucideLoaderCircle,
  LucideUserPlus,
} from '@lucide/angular';
import * as QRCode from 'qrcode';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { ApprovedMember } from '../../../../shared/models/schedule.models';
import { Button } from '../../../../shared/ui/button/button';
import { Modal } from '../../../../shared/ui/modal/modal';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

/**
 * Empleados del negocio: lista de miembros aprobados. Cada fila enlaza a los
 * horarios filtrados por ese empleado.
 */
@Component({
  selector: 'app-business-employees-section',
  imports: [
    RouterLink,
    Button,
    Modal,
    LucideCalendarClock,
    LucideClipboardCheck,
    LucideClipboardCopy,
    LucideLoaderCircle,
    LucideUserPlus,
  ],
  templateUrl: './business-employees.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessEmployeesSection implements OnInit {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly businessId = this.session.activeBusinessAccountId;
  readonly membership = this.session.activeMembership;
  readonly account = computed(() => this.membership()?.businessAccount ?? null);
  readonly businessName = computed(() => this.account()?.name?.trim() || 'Negocio sin nombre');
  readonly members = signal<ApprovedMember[]>([]);
  readonly loading = signal(false);
  readonly message = signal('');
  readonly inviteOpen = signal(false);
  readonly copied = signal(false);
  readonly linkCopied = signal(false);
  readonly qrDataUrl = signal('');
  readonly qrError = signal('');

  readonly canManage = computed(
    () =>
      this.session.activeMembership()?.role === 'account_owner' ||
      this.session.user()?.globalRole === 'account_su',
  );

  readonly shareCode = computed(() => {
    const id = this.businessId();
    return id ? id.slice(-6).toUpperCase() : '';
  });

  readonly registrationLink = computed(() => {
    const code = this.shareCode();
    if (!code) {
      return '';
    }
    const origin = globalThis.location?.origin ?? '';
    const params = new URLSearchParams({
      code,
      businessName: this.businessName(),
    });
    return `${origin}/register?${params.toString()}`;
  });

  readonly registrationPath = computed(() => {
    const code = this.shareCode();
    if (!code) {
      return '';
    }
    const params = new URLSearchParams({
      code,
      businessName: this.businessName(),
    });
    return `/register?${params.toString()}`;
  });

  private qrGeneration = 0;

  constructor() {
    effect(() => {
      const link = this.registrationLink();
      const generation = ++this.qrGeneration;
      this.qrDataUrl.set('');
      this.qrError.set('');

      if (!link) {
        return;
      }

      void QRCode.toDataURL(link, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 220,
        color: {
          dark: '#102a2cff',
          light: '#ffffffff',
        },
      })
        .then((dataUrl) => {
          if (generation === this.qrGeneration) {
            this.qrDataUrl.set(dataUrl);
          }
        })
        .catch(() => {
          if (generation === this.qrGeneration) {
            this.qrError.set('No se pudo generar el QR.');
          }
        });
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }
    this.loading.set(true);
    this.message.set('');
    this.businessApi
      .listApprovedMembers(businessId)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.members.set(response.memberships),
        error: (error) => this.handleError(error),
      });
  }

  employeeLabel(member: ApprovedMember): string {
    const name = [member.firstName, member.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return (
      name ||
      member.email ||
      member.identificationNumber ||
      'Empleado sin datos'
    );
  }

  contactLabel(member: ApprovedMember): string {
    return member.cellphoneNumber ?? member.email ?? member.identificationNumber ?? '';
  }

  roleLabel(member: ApprovedMember): string {
    return member.role === 'account_owner' ? 'Propietario' : 'Staff';
  }

  scheduleLink(): unknown[] {
    const id = this.businessId();
    return id ? ['/businesses', id, 'schedules'] : ['/businesses'];
  }

  openInvite(): void {
    this.inviteOpen.set(true);
  }

  closeInvite(): void {
    this.inviteOpen.set(false);
  }

  copyCode(): void {
    const code = this.shareCode();
    if (!code) {
      return;
    }
    void navigator.clipboard?.writeText(code).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }

  copyRegistrationLink(): void {
    const link = this.registrationLink();
    if (!link) {
      return;
    }
    void navigator.clipboard?.writeText(link).then(() => {
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 1500);
    });
  }

  private handleError(error: unknown): void {
    this.members.set([]);
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.message.set('No tienes permisos para ver los empleados.');
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.message.set('El listado de empleados aún no está disponible en el backend.');
      return;
    }
    this.message.set(httpErrorMessage(error));
  }
}
