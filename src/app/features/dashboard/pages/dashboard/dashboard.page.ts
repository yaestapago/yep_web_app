import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe, DatePipe, PercentPipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideActivity,
  LucideBanknote,
  LucideBell,
  LucideFileScan,
  LucideLoaderCircle,
  LucideRefreshCw,
  LucideSend,
  LucideShieldCheck,
  LucideTriangleAlert,
  LucideUpload,
  LucideUsers,
} from '@lucide/angular';
import { finalize, switchMap } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { BusinessMembership } from '../../../../shared/models/auth.models';
import {
  TransactionExtractionResponse,
  nullablePartyToRequestParty,
} from '../../../../shared/models/extraction.models';
import { SourceEvent } from '../../../../shared/models/source-event.models';
import {
  CreateTransactionRequest,
  MechanismKind,
  PaymentTransaction,
  TransactionParty,
} from '../../../../shared/models/transaction.models';
import { Customer } from '../../../../shared/models/customer.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../../business/services/business-accounts-api.service';
import { CustomersApiService } from '../../../customers/services/customers-api.service';
import { ExtractionApiService } from '../../../extraction/services/extraction-api.service';
import { SourceEventsApiService } from '../../../source-events/services/source-events-api.service';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';

type DashboardView = 'transactions' | 'events' | 'customers' | 'staffRequests' | 'capture';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    CurrencyPipe,
    DatePipe,
    PercentPipe,
    ReactiveFormsModule,
    LucideActivity,
    LucideBanknote,
    LucideBell,
    LucideFileScan,
    LucideLoaderCircle,
    LucideRefreshCw,
    LucideSend,
    LucideShieldCheck,
    LucideTriangleAlert,
    LucideUpload,
    LucideUsers,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage implements OnInit {
  private readonly transactionsApi = inject(TransactionsApiService);
  private readonly sourceEventsApi = inject(SourceEventsApiService);
  private readonly customersApi = inject(CustomersApiService);
  private readonly extractionApi = inject(ExtractionApiService);
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(AuthSessionService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly user = this.session.user;
  readonly activeMembership = this.session.activeMembership;
  readonly approvedMemberships = this.session.approvedMemberships;
  readonly activeBusinessAccountId = this.session.activeBusinessAccountId;

  readonly activeView = signal<DashboardView>('transactions');
  readonly loadingTransactions = signal(false);
  readonly loadingEvents = signal(false);
  readonly loadingCustomers = signal(false);
  readonly loadingStaffRequests = signal(false);
  readonly extracting = signal(false);
  readonly creatingTransaction = signal(false);
  readonly actingMembershipId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly staffRequestsMessage = signal(
    'El backend aun no expone la bandeja completa de solicitudes pendientes del owner.',
  );
  readonly staffRequestsAttempted = signal(false);
  readonly staffRequestsBackendPending = signal(true);
  readonly selectedReceipt = signal<File | null>(null);
  readonly extraction = signal<TransactionExtractionResponse | null>(null);

  readonly transactions = signal<PaymentTransaction[]>([]);
  readonly sourceEvents = signal<SourceEvent[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly staffRequests = signal<BusinessMembership[]>([]);

  readonly totalAmount = computed(() =>
    this.transactions().reduce((total, transaction) => total + transaction.amount, 0),
  );
  readonly paidCount = computed(
    () =>
      this.transactions().filter((transaction) => transaction.verification.canBeConsideredPaid)
        .length,
  );
  readonly openReviewCount = computed(
    () =>
      this.transactions().filter((transaction) =>
        ['PENDING_VERIFICATION', 'NEEDS_REVIEW'].includes(transaction.status),
      ).length,
  );
  readonly canManageStaffRequests = computed(
    () => this.activeMembership()?.role === 'account_owner' || this.user()?.globalRole === 'account_su',
  );

  readonly manualForm = this.fb.group({
    bankId: ['', [Validators.required, Validators.minLength(2)]],
    transactionDate: [this.defaultDateTimeLocal(), [Validators.required]],
    amount: [0, [Validators.required, Validators.min(1)]],
    currency: ['COP', [Validators.required, Validators.minLength(3)]],
    reference: [''],
    senderName: [''],
    senderAccount: [''],
    receiverName: [''],
    receiverAccount: [''],
    notes: [''],
  });

  ngOnInit(): void {
    this.loadOverview();
  }

  loadOverview(): void {
    if (!this.session.activeBusinessAccountId()) {
      this.error.set('Selecciona un negocio activo antes de cargar datos.');
      return;
    }

    this.loadTransactions();
    this.loadSourceEvents();
    this.loadCustomers();
  }

  loadTransactions(): void {
    this.loadingTransactions.set(true);
    this.error.set('');

    this.transactionsApi
      .list({ limit: 100 })
      .pipe(
        finalize(() => this.loadingTransactions.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.transactions.set(response.transactions),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  loadSourceEvents(): void {
    this.loadingEvents.set(true);
    this.error.set('');

    this.sourceEventsApi
      .list()
      .pipe(
        finalize(() => this.loadingEvents.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.sourceEvents.set(response.sourceEvents),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  loadCustomers(): void {
    this.loadingCustomers.set(true);
    this.error.set('');

    this.customersApi
      .list('lastSeenAt', 50)
      .pipe(
        finalize(() => this.loadingCustomers.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.customers.set(response.customers),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  selectView(view: DashboardView): void {
    this.activeView.set(view);
  }

  loadStaffRequests(): void {
    const businessAccountId = this.activeBusinessAccountId();

    if (!businessAccountId) {
      this.staffRequestsMessage.set('Selecciona un negocio activo para revisar solicitudes.');
      return;
    }

    this.loadingStaffRequests.set(true);
    this.staffRequestsAttempted.set(true);
    this.staffRequestsMessage.set('');

    // Backend pending: this call targets the expected owner inbox endpoint.
    // Remove the pending-state copy once the API is implemented.
    this.businessApi
      .listPendingStaffRequests(businessAccountId)
      .pipe(
        finalize(() => this.loadingStaffRequests.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.staffRequestsBackendPending.set(false);
          this.staffRequests.set(
            response.memberships.filter(
              (membership) =>
                membership.role === 'account_staff' && membership.status === 'pending',
            ),
          );
          this.staffRequestsMessage.set('');
        },
        error: (error) => this.handleStaffRequestsError(error),
      });
  }

  selectBusiness(event: Event): void {
    const businessAccountId = (event.target as HTMLSelectElement).value;

    this.session.setActiveBusinessAccountId(businessAccountId);
    this.loadOverview();
  }

  onReceiptSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.selectedReceipt.set(file);
    this.extraction.set(null);
    this.success.set('');
    this.error.set('');
  }

  extractReceipt(): void {
    const file = this.selectedReceipt();

    if (!file) {
      this.error.set('Selecciona una imagen de comprobante.');
      return;
    }

    this.extracting.set(true);
    this.error.set('');
    this.success.set('');

    this.extractionApi
      .extractReceipt(file)
      .pipe(
        finalize(() => this.extracting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.extraction.set(response);
          this.patchFormFromExtraction(response);
          this.success.set('OCR completado. Revisa los datos antes de crear la transaccion.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  createManualTransaction(): void {
    this.createTransactionFromForm('manual');
  }

  createTransactionFromOcr(): void {
    const extraction = this.extraction();

    if (!extraction) {
      this.error.set('Primero ejecuta OCR sobre un comprobante.');
      return;
    }

    const request = this.buildTransactionRequest('ocr_extraction');
    if (!request) {
      return;
    }

    this.creatingTransaction.set(true);
    this.error.set('');
    this.success.set('');

    this.sourceEventsApi
      .ingest({
        sourceType: 'OCR_UPLOAD',
        rawPayload: {
          fileName: this.selectedReceipt()?.name,
          model: extraction.model,
          transaction: extraction.transaction,
          diagnostics: extraction.diagnostics,
        },
        normalized: {
          bankId: request.bankId,
          amount: request.amount,
          currency: request.currency,
          reference: request.reference,
          transactionDate: request.transactionDate,
          senderAccount: request.sender?.account,
          receiverAccount: request.receiver?.account,
        },
      })
      .pipe(
        switchMap((event) => this.transactionsApi.create({ ...request, sourceEventId: event.id })),
        finalize(() => this.creatingTransaction.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.afterTransactionCreated(response.transaction, response.action),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  createTransactionFromForm(mechanismKind: MechanismKind): void {
    const request = this.buildTransactionRequest(mechanismKind);
    if (!request) {
      return;
    }

    this.creatingTransaction.set(true);
    this.error.set('');
    this.success.set('');

    this.transactionsApi
      .create(request)
      .pipe(
        finalize(() => this.creatingTransaction.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.afterTransactionCreated(response.transaction, response.action),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  runVerification(transaction: PaymentTransaction): void {
    this.loadingTransactions.set(true);
    this.error.set('');

    this.transactionsApi
      .runVerification(transaction.id)
      .pipe(
        finalize(() => this.loadingTransactions.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.success.set('Verificacion ejecutada.');
          this.loadTransactions();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  approveStaffRequest(membership: BusinessMembership): void {
    this.updateStaffRequestStatus(membership, 'approved');
  }

  rejectStaffRequest(membership: BusinessMembership): void {
    const confirmed = window.confirm('¿Rechazar esta solicitud de staff?');

    if (!confirmed) {
      return;
    }

    this.updateStaffRequestStatus(membership, 'rejected');
  }

  businessName(businessAccountId: string): string {
    return (
      this.approvedMemberships().find(
        (membership) => membership.businessAccountId === businessAccountId,
      )?.businessAccount?.name ?? businessAccountId
    );
  }

  eventTitle(event: SourceEvent): string {
    return event.normalized?.reference ?? event.externalId ?? event.sourceType;
  }

  eventAmount(event: SourceEvent): number | null {
    return event.normalized?.amount ?? null;
  }

  customerName(customer: Customer): string {
    return customer.displayName ?? customer.account ?? customer.id;
  }

  requesterLabel(membership: BusinessMembership): string {
    return membership.email ?? membership.identificationNumber ?? membership.userId ?? 'Solicitante sin datos';
  }

  rawSummary(payload: Record<string, unknown>): string {
    return JSON.stringify(payload).slice(0, 180);
  }

  isInvalid(controlName: keyof typeof this.manualForm.controls): boolean {
    const control = this.manualForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  private buildTransactionRequest(mechanismKind: MechanismKind): CreateTransactionRequest | null {
    this.error.set('');

    if (this.manualForm.invalid) {
      this.manualForm.markAllAsTouched();
      return null;
    }

    const raw = this.manualForm.getRawValue();
    const amount = Number(raw.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      this.error.set('Ingresa un valor valido para la transaccion.');
      return null;
    }

    return {
      bankId: raw.bankId.trim().toLowerCase(),
      transactionDate: this.toIsoDate(raw.transactionDate),
      amount,
      currency: raw.currency.trim().toUpperCase() || 'COP',
      reference: this.optional(raw.reference),
      sender: this.party(raw.senderName, raw.senderAccount),
      receiver: this.party(raw.receiverName, raw.receiverAccount),
      mechanismKind,
      notes: this.optional(raw.notes),
    };
  }

  private updateStaffRequestStatus(
    membership: BusinessMembership,
    status: 'approved' | 'rejected',
  ): void {
    this.actingMembershipId.set(membership.id);
    this.error.set('');
    this.success.set('');

    this.businessApi
      .updateMembershipStatus(membership.businessAccountId, membership.id, { status })
      .pipe(
        finalize(() => this.actingMembershipId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.staffRequests.update((memberships) =>
            memberships.filter((current) => current.id !== response.membership.id),
          );
          this.success.set(status === 'approved' ? 'Solicitud aprobada.' : 'Solicitud rechazada.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private handleStaffRequestsError(error: unknown): void {
    this.staffRequests.set([]);

    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.staffRequestsBackendPending.set(true);
      this.staffRequestsMessage.set(
        'Endpoint pendiente en backend: GET /business-accounts/:businessAccountId/membership-requests?status=pending.',
      );
      return;
    }

    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.staffRequestsMessage.set('Sesion expirada o token invalido. Inicia sesion nuevamente.');
      return;
    }

    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.staffRequestsMessage.set('No tienes permisos de owner para ver estas solicitudes.');
      return;
    }

    this.staffRequestsMessage.set(httpErrorMessage(error));
  }

  private afterTransactionCreated(
    transaction: PaymentTransaction,
    action: 'CREATED' | 'RETURNED_EXISTING' | 'DUPLICATE_DETECTED',
  ): void {
    this.transactions.update((transactions) => [
      transaction,
      ...transactions.filter((current) => current.id !== transaction.id),
    ]);
    this.success.set(
      action === 'CREATED'
        ? 'Transaccion creada.'
        : 'Ya existia una transaccion con los mismos datos.',
    );
    this.manualForm.reset({
      bankId: '',
      transactionDate: this.defaultDateTimeLocal(),
      amount: 0,
      currency: 'COP',
      reference: '',
      senderName: '',
      senderAccount: '',
      receiverName: '',
      receiverAccount: '',
      notes: '',
    });
    this.extraction.set(null);
    this.selectedReceipt.set(null);
    this.loadSourceEvents();
    this.loadCustomers();
  }

  private patchFormFromExtraction(response: TransactionExtractionResponse): void {
    const transaction = response.transaction;
    const sender = nullablePartyToRequestParty(transaction.sender);
    const receiver = nullablePartyToRequestParty(transaction.receiver);

    this.manualForm.patchValue({
      bankId: transaction.bank?.trim().toLowerCase() ?? '',
      transactionDate: this.toDateTimeLocal(transaction.dateTime ?? new Date().toISOString()),
      amount: transaction.amount ?? 0,
      currency: transaction.currency ?? 'COP',
      reference: transaction.reference ?? '',
      senderName: sender?.name ?? '',
      senderAccount: sender?.account ?? '',
      receiverName: receiver?.name ?? '',
      receiverAccount: receiver?.account ?? '',
    });
  }

  private party(name: string, account: string): TransactionParty | undefined {
    const normalized = {
      name: this.optional(name),
      account: this.optional(account),
    };

    return normalized.name || normalized.account ? normalized : undefined;
  }

  private optional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private defaultDateTimeLocal(): string {
    return this.toDateTimeLocal(new Date().toISOString());
  }

  private toDateTimeLocal(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return this.defaultDateTimeLocal();
    }

    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
  }

  private toIsoDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }
}
