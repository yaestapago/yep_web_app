import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, input as defineInput, output, signal } from '@angular/core';
import {
  LucideEye,
  LucideLoaderCircle,
  LucideListChecks,
  LucideSearch,
  LucideShieldCheck,
  LucideTriangleAlert,
} from '@lucide/angular';

import type {
  PaymentTransaction,
  VerificationLevel,
} from '../../../../shared/models/transaction.models';
import {
  transactionCategory,
  transactionStatusLabel,
  transactionTone,
  verificationLevelLabel,
  type TransactionCategory,
} from '../../../../shared/utils/transaction-status';

type PeriodFilter = 'all' | 'today' | '7d' | '30d';

const LEVELS: VerificationLevel[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'MANUAL'];

/**
 * Zona 4: tabla dinámica y compacta de transacciones con filtros client-side.
 * Las acciones "Ver" y "Verificar" se delegan al orquestador vía outputs.
 */
@Component({
  selector: 'app-dashboard-transactions',
  imports: [
    CurrencyPipe,
    DatePipe,
    LucideEye,
    LucideListChecks,
    LucideLoaderCircle,
    LucideSearch,
    LucideShieldCheck,
    LucideTriangleAlert,
  ],
  templateUrl: './dashboard-transactions.html',
  styleUrls: ['./dashboard-shared.scss', './dashboard-transactions.scss'],
})
export class DashboardTransactionsPanel {
  readonly transactions = defineInput.required<PaymentTransaction[]>();
  readonly loading = defineInput(false);
  readonly error = defineInput('');
  readonly verifyingId = defineInput<string | null>(null);

  readonly view = output<PaymentTransaction>();
  readonly verify = output<PaymentTransaction>();

  readonly search = signal('');
  readonly statusFilter = signal<string>('');
  readonly bankFilter = signal<string>('');
  readonly levelFilter = signal<string>('');
  readonly period = signal<PeriodFilter>('all');
  readonly amountMin = signal<string>('');
  readonly amountMax = signal<string>('');
  readonly onlyActionable = signal(false);

  readonly levels = LEVELS;

  readonly bankOptions = computed(() => {
    const set = new Set<string>();
    for (const tx of this.transactions()) {
      if (tx.bankId) {
        set.add(tx.bankId);
      }
    }
    return [...set];
  });

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const bank = this.bankFilter();
    const level = this.levelFilter();
    const min = this.amountMin() ? Number(this.amountMin()) : null;
    const max = this.amountMax() ? Number(this.amountMax()) : null;
    const onlyActionable = this.onlyActionable();
    const since = this.periodStart(this.period());

    return this.transactions()
      .filter((tx) => {
        if (status && transactionCategory(tx.status) !== status) {
          return false;
        }
        if (bank && tx.bankId !== bank) {
          return false;
        }
        if (level && tx.verification.level !== level) {
          return false;
        }
        if (min !== null && tx.amount < min) {
          return false;
        }
        if (max !== null && tx.amount > max) {
          return false;
        }
        if (onlyActionable && !this.isActionable(tx)) {
          return false;
        }
        if (since !== null) {
          const time = new Date(tx.transactionDate).getTime();
          if (Number.isNaN(time) || time < since) {
            return false;
          }
        }
        if (term) {
          const haystack = [
            tx.reference,
            tx.bankId,
            tx.amount.toString(),
            tx.sender?.name,
            tx.sender?.account,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(term)) {
            return false;
          }
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime(),
      );
  });

  category(tx: PaymentTransaction): TransactionCategory {
    return transactionCategory(tx.status);
  }

  statusLabel(tx: PaymentTransaction): string {
    return transactionStatusLabel(tx.status);
  }

  tone(tx: PaymentTransaction): string {
    return transactionTone(tx.status);
  }

  levelLabel(level: VerificationLevel): string {
    return verificationLevelLabel(level);
  }

  isActionable(tx: PaymentTransaction): boolean {
    return (
      !tx.verification.canBeConsideredPaid &&
      ['CREATED', 'PENDING_VERIFICATION', 'NEEDS_REVIEW', 'EVIDENCE_MATCHED'].includes(tx.status)
    );
  }

  resetFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
    this.bankFilter.set('');
    this.levelFilter.set('');
    this.period.set('all');
    this.amountMin.set('');
    this.amountMax.set('');
    this.onlyActionable.set(false);
  }

  private periodStart(period: PeriodFilter): number | null {
    if (period === 'all') {
      return null;
    }
    const now = new Date();
    if (period === 'today') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    }
    const days = period === '7d' ? 7 : 30;
    return now.getTime() - days * 86_400_000;
  }
}
