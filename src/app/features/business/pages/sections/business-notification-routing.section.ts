import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import {
  LucideChevronRight,
  LucideLoaderCircle,
  LucideRefreshCw,
  LucideUsers,
} from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { Button } from '../../../../shared/ui/button/button';
import { Checkbox } from '../../../../shared/ui/checkbox/checkbox';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import type { BankPickerEntry } from '../../../../shared/models/bank.models';
import type { BankAccount } from '../../../../shared/models/bank-account.models';
import type { NotificationRoutingRule } from '../../../../shared/models/notification-routing.models';
import type { ApprovedMember } from '../../../../shared/models/schedule.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BanksApiService } from '../../../banks/services/banks-api.service';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';
import { NotificationRoutingApiService } from '../../../notifications-routing/services/notification-routing-api.service';

interface EmployeeRoutingView {
  member: ApprovedMember;
  rules: NotificationRoutingRule[];
}

@Component({
  selector: 'app-business-notification-routing-section',
  imports: [
    Button,
    Checkbox,
    LucideChevronRight,
    LucideLoaderCircle,
    LucideRefreshCw,
    LucideUsers,
  ],
  templateUrl: './business-notification-routing.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessNotificationRoutingSection implements OnInit {
  private readonly routingApi = inject(NotificationRoutingApiService);
  private readonly banksApi = inject(BanksApiService);
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notifications = inject(NotificationModalService);

  readonly members = signal<ApprovedMember[]>([]);
  readonly bankAccounts = signal<BankAccount[]>([]);
  readonly rules = signal<NotificationRoutingRule[]>([]);
  readonly bankCatalog = signal<Map<string, BankPickerEntry>>(new Map());
  readonly loading = signal(true);
  readonly error = signal('');
  readonly expandedEmployeeIds = signal(new Set<string>());
  readonly actingId = signal<string | null>(null);

  readonly canManage = computed(() => {
    const membership = this.session.activeMembership();
    return membership?.role === 'account_owner';
  });

  readonly businessId = this.session.activeBusinessAccountId;

  readonly bankAccountsByBank = computed(() => {
    const grouped = new Map<string, BankAccount[]>();
    for (const account of this.bankAccounts()) {
      if (!account.isActive) continue;
      const list = grouped.get(account.bankId) ?? [];
      list.push(account);
      grouped.set(account.bankId, list);
    }
    return Array.from(grouped.entries());
  });

  readonly employeeViews = computed<EmployeeRoutingView[]>(() => {
    const allRules = this.rules();
    return this.members().map((member) => ({
      member,
      rules: allRules.filter((r) =>
        member.cellphoneNumber ? this.phoneMatch(r.recipientPhone, member.cellphoneNumber) : false,
      ),
    }));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    const bizId = this.businessId();
    if (!bizId) {
      this.error.set('No hay negocio seleccionado');
      this.loading.set(false);
      return;
    }

    forkJoin({
      members: this.businessApi.listApprovedMembers(bizId),
      bankAccounts: this.businessApi.listBankAccounts(bizId),
      rules: this.routingApi.list(),
      banks: this.banksApi.list(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.members.set(res.members.memberships);
          this.bankAccounts.set(res.bankAccounts.bankAccounts);
          this.rules.set(res.rules.rules);

          const map = new Map<string, BankPickerEntry>();
          for (const bank of res.banks.banks) {
            map.set(bank.code, bank);
          }
          this.bankCatalog.set(map);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(httpErrorMessage(err));
          this.loading.set(false);
        },
      });
  }

  private normalizeDigits(value: string): string {
    return value.replace(/\D/g, '');
  }

  private phoneMatch(a: string, b: string): boolean {
    return this.normalizeDigits(a) === this.normalizeDigits(b);
  }

  isEmployeeEnabled(member: ApprovedMember): boolean {
    if (!member.cellphoneNumber) return false;
    return this.rules().some(
      (r) => this.phoneMatch(r.recipientPhone, member.cellphoneNumber!) && r.active,
    );
  }

  private findRule(member: ApprovedMember, bankId: string): NotificationRoutingRule | undefined {
    if (!member.cellphoneNumber) return undefined;
    return this.rules().find(
      (r) =>
        this.phoneMatch(r.recipientPhone, member.cellphoneNumber!) &&
        r.bankId === bankId,
    );
  }

  isBankAccountEnabled(member: ApprovedMember, accountId: string, bankId: string): boolean {
    const rule = this.findRule(member, bankId);
    if (!rule || !rule.active) return false;
    if (rule.bankAccountIds.length === 0) return true;
    return rule.bankAccountIds.includes(accountId);
  }

  isBreBKeyEnabled(
    member: ApprovedMember,
    bankId: string,
    key: string,
  ): boolean {
    if (!member.cellphoneNumber) return false;
    const rule = this.rules().find(
      (r) =>
        this.phoneMatch(r.recipientPhone, member.cellphoneNumber!) &&
        r.bankId === bankId &&
        r.active,
    );
    if (!rule) return false;
    if (!rule.breBKeys || rule.breBKeys.length === 0) return true;
    return rule.breBKeys.includes(key);
  }

  toggleExpand(employeeId: string): void {
    const current = new Set(this.expandedEmployeeIds());
    if (current.has(employeeId)) {
      current.delete(employeeId);
    } else {
      current.add(employeeId);
    }
    this.expandedEmployeeIds.set(current);
  }

  toggleEmployee(member: ApprovedMember): void {
    if (!member.cellphoneNumber) return;
    this.actingId.set(member.id);

    const phone = member.cellphoneNumber;

    const activeRules = this.rules().filter(
      (r) => this.phoneMatch(r.recipientPhone, phone) && r.active,
    );
    const inactiveRules = this.rules().filter(
      (r) => this.phoneMatch(r.recipientPhone, phone) && !r.active,
    );

    if (activeRules.length > 0) {
      const toggles$ = activeRules.map((r) => this.routingApi.toggle(r.id));
      forkJoin(toggles$)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => { this.load(); this.actingId.set(null); },
          error: (err) => {
            void this.notifications.error({ title: httpErrorMessage(err) });
            this.actingId.set(null);
          },
        });
      return;
    }

    if (inactiveRules.length > 0) {
      const toggles$ = inactiveRules.map((r) => this.routingApi.toggle(r.id));
      forkJoin(toggles$)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => { this.load(); this.actingId.set(null); },
          error: (err) => {
            void this.notifications.error({ title: httpErrorMessage(err) });
            this.actingId.set(null);
          },
        });
      return;
    }

    const bankIds = Array.from(this.bankAccountsByBank().map(([bankId]) => bankId));
    if (bankIds.length === 0) {
      void this.notifications.error({
        title: 'No hay cuentas bancarias configuradas para este negocio.',
      });
      this.actingId.set(null);
      return;
    }

    const creates$ = bankIds.map((bankId) =>
      this.routingApi.create({
        bankId,
        recipientPhone: phone,
        recipientUserId: member.userId,
      }),
    );

    forkJoin(creates$)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.load(); this.actingId.set(null); },
        error: (err) => {
          void this.notifications.error({ title: httpErrorMessage(err) });
          this.actingId.set(null);
        },
      });
  }

  toggleBankAccount(member: ApprovedMember, accountId: string, bankId: string): void {
    if (!member.cellphoneNumber) return;
    this.actingId.set(member.id);

    const existingRule = this.findRule(member, bankId);
    const allIds = this.bankAccounts()
      .filter((a) => a.bankId === bankId && a.isActive)
      .map((a) => a.id);

    if (!existingRule) {
      this.routingApi
        .create({
          bankId,
          recipientPhone: member.cellphoneNumber!,
          recipientUserId: member.userId,
          bankAccountIds: [accountId],
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => { this.load(); this.actingId.set(null); },
          error: (err) => {
            void this.notifications.error({ title: httpErrorMessage(err) });
            this.actingId.set(null);
          },
        });
      return;
    }

    const currentIds = existingRule.bankAccountIds;
    let newIds: string[];

    if (!existingRule.active) {
      newIds = [accountId];
    } else if (currentIds.length === 0) {
      newIds = allIds.filter((id) => id !== accountId);
    } else if (currentIds.includes(accountId)) {
      newIds = currentIds.filter((id) => id !== accountId);
    } else {
      newIds = [...currentIds, accountId];
      if (allIds.length > 0 && allIds.every((id) => newIds.includes(id))) {
        newIds = [];
      }
    }

    const shouldActivate = !existingRule.active || newIds.length > 0;

    this.routingApi
      .update(existingRule.id, {
        bankAccountIds: newIds,
        ...(shouldActivate !== existingRule.active ? {} : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (shouldActivate !== existingRule.active) {
            this.routingApi.toggle(existingRule.id)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: () => { this.load(); this.actingId.set(null); },
                error: (err) => {
                  void this.notifications.error({ title: httpErrorMessage(err) });
                  this.actingId.set(null);
                },
              });
          } else {
            this.load();
            this.actingId.set(null);
          }
        },
        error: (err) => {
          void this.notifications.error({ title: httpErrorMessage(err) });
          this.actingId.set(null);
        },
      });
  }

  toggleBreBKey(
    member: ApprovedMember,
    bankId: string,
    key: string,
  ): void {
    if (!member.cellphoneNumber) return;
    this.actingId.set(member.id);

    const rule = this.rules().find(
      (r) =>
        this.phoneMatch(r.recipientPhone, member.cellphoneNumber!) &&
        r.bankId === bankId &&
        r.active,
    );
    if (!rule) {
      this.actingId.set(null);
      return;
    }

    const currentKeys = rule.breBKeys ?? [];
    const keyEnabled =
      currentKeys.length === 0 || currentKeys.includes(key);

    let newKeys: string[];
    if (keyEnabled) {
      if (currentKeys.length === 0) {
        const allKeys = this.getAllBreBKeysForBank(bankId);
        newKeys = allKeys.filter((k) => k !== key);
      } else {
        newKeys = currentKeys.filter((k) => k !== key);
      }
    } else {
      newKeys = [...currentKeys, key];
    }

    this.routingApi
      .update(rule.id, { breBKeys: newKeys })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.load();
          this.actingId.set(null);
        },
        error: (err) => {
          void this.notifications.error({ title: httpErrorMessage(err) });
          this.actingId.set(null);
        },
      });
  }

  bankName(bankId: string): string {
    return this.bankCatalog().get(bankId)?.name ?? bankId;
  }

  employeeName(member: ApprovedMember): string {
    const name = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim();
    return name || (member.email ?? 'Sin nombre');
  }

  formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      const last10 = digits.slice(-10);
      const prefix = digits.slice(0, -10);
      return `+${prefix} ${last10.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}`;
    }
    return phone;
  }

  accountTypeLabel(type?: string): string {
    switch (type) {
      case 'savings':
        return 'Ahorros';
      case 'checking':
        return 'Corriente';
      case 'wallet':
        return 'Wallet';
      default:
        return 'Cuenta';
    }
  }

  accountDisplayName(account: BankAccount): string {
    if (account.displayName) return account.displayName;
    return `${this.bankName(account.bankId)} · ****${account.accountNumberLast4}`;
  }

  getBreBKeysForAccount(account: BankAccount): string[] {
    return account.breBKeys ?? [];
  }

  activeAccountCount(member: ApprovedMember): number {
    if (!member.cellphoneNumber) return 0;
    let count = 0;
    for (const [bankId, accounts] of this.bankAccountsByBank()) {
      const rule = this.rules().find(
        (r) =>
          this.phoneMatch(r.recipientPhone, member.cellphoneNumber!) &&
          r.bankId === bankId &&
          r.active,
      );
      if (!rule) continue;
      if (rule.bankAccountIds.length === 0) {
        count += accounts.length;
      } else {
        count += rule.bankAccountIds.length;
      }
    }
    return count;
  }

  totalAccountCount(): number {
    return this.bankAccounts().filter((a) => a.isActive).length;
  }

  toggleAllAccounts(member: ApprovedMember): void {
    this.toggleEmployee(member);
  }

  private getAllBreBKeysForBank(bankId: string): string[] {
    return this.bankAccounts()
      .filter((a) => a.bankId === bankId && a.isActive)
      .flatMap((a) => a.breBKeys ?? []);
  }
}
