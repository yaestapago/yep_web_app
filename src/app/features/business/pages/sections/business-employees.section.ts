import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LucideCalendarClock, LucideLoaderCircle } from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { ApprovedMember } from '../../../../shared/models/schedule.models';
import { Button } from '../../../../shared/ui/button/button';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

/**
 * Empleados del negocio: lista de miembros aprobados. Cada fila enlaza a los
 * horarios filtrados por ese empleado.
 */
@Component({
  selector: 'app-business-employees-section',
  imports: [RouterLink, Button, LucideCalendarClock, LucideLoaderCircle],
  templateUrl: './business-employees.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessEmployeesSection implements OnInit {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly businessId = this.session.activeBusinessAccountId;
  readonly members = signal<ApprovedMember[]>([]);
  readonly loading = signal(false);
  readonly message = signal('');

  readonly canManage = computed(
    () =>
      this.session.activeMembership()?.role === 'account_owner' ||
      this.session.user()?.globalRole === 'account_su',
  );

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
