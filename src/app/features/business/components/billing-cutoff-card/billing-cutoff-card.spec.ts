import { HttpErrorResponse } from '@angular/common/http';
import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { BillingStatusService } from '../../../../core/services/billing-status.service';
import type {
  AdjustCutoffResponse,
  BillingStatusResponse,
} from '../../../../shared/models/billing-status.models';
import { AdminBusinessBillingApiService } from '../../../admin-billing/services/admin-business-billing-api.service';
import { BillingCutoffCard } from './billing-cutoff-card';

const businessId = '66f0a1b2c3d4e5f607181920';

function statusResponse(overrides: Partial<BillingStatusResponse> = {}): BillingStatusResponse {
  return {
    businessAccountId: businessId,
    phase: 'paid',
    state: 'due_soon',
    reason: null,
    deadline: '2026-11-05T05:00:00.000Z',
    daysLeft: 3,
    blockedAt: null,
    isOwner: false,
    planName: 'Pro',
    currentInvoice: {
      id: 'inv-1',
      invoiceNumber: 'YEP-0000042',
      totalCop: 90000,
      status: 'issued',
    },
    cutoffDate: '2026-11-05T05:00:00.000Z',
    billingPeriod: 'monthly',
    pendingBillingPeriod: null,
    pendingBillingPeriodEffectiveAt: null,
    ...overrides,
  };
}

const adjustResponse: AdjustCutoffResponse = {
  businessAccountId: businessId,
  phase: 'paid',
  state: 'ok',
  status: 'active',
  cutoffDate: '2027-01-15T05:00:00.000Z',
  deadline: '2027-01-15T05:00:00.000Z',
  daysLeft: 100,
  blockedAt: null,
  currentInvoice: null,
};

describe('BillingCutoffCard — cobro y fecha de corte (superadmin)', () => {
  let isSuperUser: WritableSignal<boolean>;
  let api: { status: ReturnType<typeof vi.fn>; adjustCutoff: ReturnType<typeof vi.fn> };
  let billing: { refresh: ReturnType<typeof vi.fn> };

  function create(): ComponentFixture<BillingCutoffCard> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthSessionService,
          useValue: { isSuperUser, activeBusinessAccountId: signal(businessId) },
        },
        { provide: BillingStatusService, useValue: billing },
        { provide: AdminBusinessBillingApiService, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(BillingCutoffCard);
    fixture.componentRef.setInput('businessId', businessId);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<BillingCutoffCard>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function clickButton(fixture: ComponentFixture<BillingCutoffCard>, label: string): void {
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((candidate) => candidate.textContent?.includes(label));
    expect(button, `botón "${label}"`).toBeTruthy();
    button!.click();
    fixture.detectChanges();
  }

  beforeEach(() => {
    isSuperUser = signal(true);
    api = {
      status: vi.fn().mockReturnValue(of(statusResponse())),
      adjustCutoff: vi.fn().mockReturnValue(of(adjustResponse)),
    };
    billing = { refresh: vi.fn().mockResolvedValue(null) };
  });

  afterEach(() => vi.restoreAllMocks());

  it('superadmin ve plan, ciclo, estado, fecha de corte y la cuenta de cobro pendiente', () => {
    const fixture = create();

    expect(api.status).toHaveBeenCalledWith(businessId);
    const content = text(fixture);
    expect(content).toContain('Cobro y fecha de corte');
    expect(content).toContain('Pro');
    expect(content).toContain('Mensual');
    expect(content).toContain('Por vencer');
    expect(content).toContain('5 de noviembre de 2026');
    expect(content).toContain('YEP-0000042');
    expect(content).toContain('$90.000');
    expect(content).toContain('Pendiente');
    expect(content).not.toContain('factura');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('input[type="date"]'),
    ).not.toBeNull();
  });

  it('soporte (u otro usuario) no ve la tarjeta ni consulta el estado de cobro', () => {
    isSuperUser.set(false);
    const fixture = create();

    expect(api.status).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-cy="billing-cutoff-card"]'),
    ).toBeNull();
    expect(text(fixture)).not.toContain('Guardar fecha de corte');
  });

  it('pide confirmación en la página y luego hace PATCH con la fecha YYYY-MM-DD y el motivo', () => {
    const fixture = create();
    const card = fixture.componentInstance;
    card.updateCutoffInput('2027-01-15');
    card.updateNote('  Cliente volvió  ');
    fixture.detectChanges();

    clickButton(fixture, 'Guardar fecha de corte');

    expect(api.adjustCutoff).not.toHaveBeenCalled();
    expect(card.confirming()).toBe(true);
    expect(text(fixture)).toContain('15 de enero de 2027');
    expect(text(fixture)).toContain(
      'Una cuenta de cobro del próximo periodo sin pagar se anula y se vuelve a generar',
    );

    clickButton(fixture, 'Sí, guardar fecha de corte');

    expect(api.adjustCutoff).toHaveBeenCalledWith(businessId, {
      cutoffDate: '2027-01-15',
      note: 'Cliente volvió',
    });
    expect(card.confirming()).toBe(false);
    expect(card.saveSuccess()).toContain('15 de enero de 2027');
    // Refresca la tarjeta y el store del negocio activo.
    expect(api.status).toHaveBeenCalledTimes(2);
    expect(billing.refresh).toHaveBeenCalledTimes(1);
  });

  it('omite el motivo vacío en el cuerpo del PATCH', () => {
    const fixture = create();
    const card = fixture.componentInstance;
    card.updateCutoffInput('2027-01-15');
    card.requestSave();
    card.confirmSave();

    expect(api.adjustCutoff).toHaveBeenCalledWith(businessId, { cutoffDate: '2027-01-15' });
  });

  it('no deja confirmar una fecha anterior a hoy', () => {
    const fixture = create();
    const card = fixture.componentInstance;
    card.updateCutoffInput('2020-01-01');
    card.requestSave();

    expect(card.confirming()).toBe(false);
    expect(card.saveError()).toContain('anterior a hoy');
    expect(api.adjustCutoff).not.toHaveBeenCalled();
  });

  it('muestra el mensaje en español del 400 del backend', () => {
    api.adjustCutoff.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: 'La fecha de corte no puede estar a más de 2 años.' },
          }),
      ),
    );
    const fixture = create();
    const card = fixture.componentInstance;
    card.updateCutoffInput('2027-01-15');
    card.requestSave();
    card.confirmSave();
    fixture.detectChanges();

    expect(card.saveError()).toBe('La fecha de corte no puede estar a más de 2 años.');
    expect(text(fixture)).toContain('La fecha de corte no puede estar a más de 2 años.');
    expect(billing.refresh).not.toHaveBeenCalled();
  });
});
