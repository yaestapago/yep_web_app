import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideArrowLeft,
  LucideBuilding2,
  LucideChevronLeft,
  LucideChevronRight,
  LucideSearch,
  LucideUsers,
} from '@lucide/angular';
import { finalize, Observable } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import {
  SupportBusiness,
  SupportBusinessDetail,
  SupportPagination,
  SupportRecord,
  SupportResource,
  SupportUser,
} from '../../models/support.models';
import { SupportApiService } from '../../services/support-api.service';

type MainView = 'users' | 'businesses';

const RESOURCE_LABELS: Record<SupportResource, string> = {
  members: 'Miembros',
  'bank-accounts': 'Cuentas bancarias',
  customers: 'Clientes',
  'source-events': 'Eventos',
  invoices: 'Facturas',
};

@Component({
  selector: 'app-support-ops-page',
  imports: [
    CommonModule,
    FormsModule,
    LucideArrowLeft,
    LucideBuilding2,
    LucideChevronLeft,
    LucideChevronRight,
    LucideSearch,
    LucideUsers,
  ],
  templateUrl: './support-ops.page.html',
  styleUrl: './support-ops.page.scss',
})
export class SupportOpsPage {
  private readonly api = inject(SupportApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly resourceLabels = RESOURCE_LABELS;
  readonly resources = Object.keys(RESOURCE_LABELS) as SupportResource[];
  readonly view = signal<MainView>('businesses');
  readonly search = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly users = signal<SupportUser[]>([]);
  readonly businesses = signal<SupportBusiness[]>([]);
  readonly pagination = signal<SupportPagination>({ page: 1, limit: 25, total: 0, pages: 0 });
  readonly selectedBusiness = signal<SupportBusinessDetail | null>(null);
  readonly resource = signal<SupportResource>('members');
  readonly records = signal<SupportRecord[]>([]);

  constructor() {
    this.load();
  }

  setView(view: MainView): void {
    this.view.set(view);
    this.selectedBusiness.set(null);
    this.search.set('');
    this.load(1);
  }

  submitSearch(): void {
    this.load(1);
  }

  load(page = this.pagination().page): void {
    if (this.selectedBusiness()) {
      this.loadResource(page);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    if (this.view() === 'users') {
      this.loadMainList(this.api.listUsers(this.search(), page), (items) => this.users.set(items));
    } else {
      this.loadMainList(this.api.listBusinesses(this.search(), page), (items) =>
        this.businesses.set(items),
      );
    }
  }

  openBusiness(business: SupportBusiness): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .getBusiness(business.id)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (detail) => {
          this.selectedBusiness.set(detail);
          this.search.set('');
          this.setResource('members');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  closeBusiness(): void {
    this.selectedBusiness.set(null);
    this.records.set([]);
    this.search.set('');
    this.load(1);
  }

  setResource(resource: SupportResource): void {
    this.resource.set(resource);
    this.search.set('');
    this.loadResource(1);
  }

  previous(): void {
    if (this.pagination().page > 1) this.load(this.pagination().page - 1);
  }

  next(): void {
    if (this.pagination().page < this.pagination().pages) this.load(this.pagination().page + 1);
  }

  display(record: SupportRecord, field: string): string {
    const value = field.split('.').reduce<unknown>((current, key) => {
      return current && typeof current === 'object'
        ? (current as Record<string, unknown>)[key]
        : undefined;
    }, record);
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  openInvoiceManagement(): void {
    const business = this.selectedBusiness()?.business;
    if (!business) return;
    void this.router.navigate(['/__ops/subscriptions/invoices'], {
      queryParams: { business: business.name, status: 'all' },
    });
  }

  private loadResource(page: number): void {
    const detail = this.selectedBusiness();
    if (!detail) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .listBusinessResource(detail.business.id, this.resource(), this.search(), page)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.records.set(response.items);
          this.pagination.set(response.pagination);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private loadMainList<T extends SupportUser | SupportBusiness>(
    request: Observable<{ items: T[]; pagination: SupportPagination }>,
    setItems: (items: T[]) => void,
  ): void {
    request
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          setItems(response.items);
          this.pagination.set(response.pagination);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }
}
