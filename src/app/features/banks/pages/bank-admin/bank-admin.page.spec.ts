import { Location } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import type { AdminBank, BankChannelConfig } from '../../../../shared/models/bank.models';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { AdminBanksApiService } from '../../services/admin-banks-api.service';
import { BankAdminPage } from './bank-admin.page';

const channel = (overrides: Partial<BankChannelConfig> = {}): BankChannelConfig => ({
  enabled: false,
  packageNames: [],
  contentPatterns: [],
  displayNames: [],
  senderPatterns: [],
  parseRules: null,
  accountResolutionPolicy: null,
  ...overrides,
});

const bancolombia: AdminBank = {
  code: 'bancolombia',
  name: 'Bancolombia',
  isActive: true,
  supportedAccountTypes: [],
  mobile: channel({
    enabled: true,
    packageNames: ['com.google.android.apps.messaging', '@default_sms'],
    contentPatterns: ['recibiste'],
    senderPatterns: ['85540', '85630', 'bancolombia'],
  }),
  email: channel(),
  desk: channel(),
  examples: [],
};

/** `@default_sms` en el catálogo de bancos (superadmin `/__ops/notifier-rules`). */
describe('BankAdminPage — token @default_sms en packageNames', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  function create(): ComponentFixture<BankAdminPage> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminBanksApiService, useValue: api },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: Location, useValue: { back: vi.fn() } },
        {
          provide: NotificationModalService,
          useValue: { confirm: vi.fn().mockResolvedValue(true) },
        },
      ],
    });
    const fixture = TestBed.createComponent(BankAdminPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = {
      list: vi.fn().mockReturnValue(of({ banks: [bancolombia] })),
      runExamples: vi.fn().mockReturnValue(of([])),
      testParse: vi.fn().mockReturnValue(of({ attributed: false, parsed: { confidence: 'none' } })),
      update: vi.fn((_code: string, request: { mobile: BankChannelConfig }) =>
        of({ bank: { ...bancolombia, mobile: { ...bancolombia.mobile, ...request.mobile } } }),
      ),
      create: vi.fn(),
    };
  });

  afterEach(() => vi.restoreAllMocks());

  it('explica el token junto al campo de paquetes del canal móvil', () => {
    const fixture = create();
    fixture.componentInstance.openEdit(bancolombia);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const hint = element.querySelector('[data-testid="default-sms-hint"]');
    expect(hint?.textContent?.replace(/\s+/g, ' ')).toContain(
      '@default_sms = la app de SMS por defecto de cada celular',
    );
    const packages = element.querySelector<HTMLTextAreaElement>(
      'textarea[formcontrolname="packageNames"]',
    );
    expect(packages?.value.split('\n')).toContain('@default_sms');
  });

  it('el resumen del canal lo lee en lenguaje humano', () => {
    const fixture = create();
    fixture.componentInstance.openEdit(bancolombia);
    const mobile = fixture.componentInstance.clarity().find((c) => c.channel === 'Móvil');
    expect(mobile?.text).toContain('la app de SMS por defecto del celular');
    expect(mobile?.text).not.toContain('@default_sms');
  });

  it('se puede escribir el token (en cualquier mayúscula) y se guarda tal cual en packageNames', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    page.openEdit({ ...bancolombia, mobile: { ...bancolombia.mobile, packageNames: [] } });
    page.form.controls.mobile.controls.packageNames.setValue(
      'com.google.android.apps.messaging\n@DEFAULT_SMS',
    );
    page.save();

    expect(api['update']).toHaveBeenCalledTimes(1);
    const [code, request] = api['update'].mock.calls[0] as [string, { mobile: BankChannelConfig }];
    expect(code).toBe('bancolombia');
    expect(request.mobile.packageNames).toEqual([
      'com.google.android.apps.messaging',
      '@default_sms',
    ]);
  });
});
