import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';
import { BusinessEmployeesSection } from './business-employees.section';

/**
 * Cubre cómo el owner comparte la invitación al negocio: el link de registro
 * empaqueta el código corto (últimos 6 caracteres del id), y el QR codifica
 * ese mismo link.
 */
describe('BusinessEmployeesSection — compartir invitación (link/QR)', () => {
  const businessId = '66f0a1b2c3d4e5f607181920';

  const session = {
    activeBusinessAccountId: signal(businessId),
    activeMembership: signal({
      role: 'account_owner',
      businessAccount: { name: 'Café Central' },
    }),
    user: signal({ globalRole: undefined }),
  };

  const businessApi = {
    listApprovedMembers: vi.fn().mockReturnValue(of({ memberships: [] })),
    listLocations: vi.fn().mockReturnValue(of({ locations: [] })),
    updateMemberSectionAccess: vi.fn(),
    updateMemberSourceEventAccess: vi.fn(),
  };

  function create(): BusinessEmployeesSection {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSessionService, useValue: session },
        { provide: BusinessAccountsApiService, useValue: businessApi },
        {
          provide: NotificationModalService,
          useValue: {
            confirm: vi.fn(),
            loading: vi.fn().mockReturnValue({ close: vi.fn() }),
            success: vi.fn().mockResolvedValue(undefined),
            error: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });
    return TestBed.runInInjectionContext(() => new BusinessEmployeesSection());
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deriva el código corto a partir de los últimos 6 caracteres del id del negocio', () => {
    const section = create();
    expect(section.shareCode()).toBe(businessId.slice(-6).toUpperCase());
  });

  it('el link de registro incluye el código y el nombre del negocio como query params', () => {
    const section = create();
    const link = new URL(section.registrationLink());

    expect(link.pathname).toBe('/register');
    expect(link.searchParams.get('code')).toBe(businessId.slice(-6).toUpperCase());
    expect(link.searchParams.get('businessName')).toBe('Café Central');
  });

  it('registrationPath es el mismo link pero sin origen, para usarlo con routerLink', () => {
    const section = create();
    expect(section.registrationPath()).toBe(
      `/register?${new URL(section.registrationLink()).search.slice(1)}`,
    );
  });

  it('conserva las casillas apagadas despues de guardar y reabrir el modal', () => {
    const section = create();
    const member = {
      id: 'staff-1',
      role: 'account_staff',
      sectionAccess: {
        dashboard: true,
        dashboardSummary: true,
        dashboardIncomeTable: true,
        businessData: true,
        reports: true,
        dashboardCharts: true,
        dashboardSystemStatus: true,
        dashboardTotalAmount: true,
        dashboardEvents: true,
        dashboardReceived: true,
        dashboardPending: true,
        dashboardRejected: true,
      },
    } as any;
    section.members.set([member]);
    section.openSectionAccess(member);
    section.toggleSectionAccess('dashboardEvents', false);
    section.toggleSectionAccess('dashboardPending', false);
    businessApi.updateMemberSectionAccess.mockImplementation(
      (_businessId, _memberId, requested) =>
        of({ membership: { ...member, sectionAccess: requested } }),
    );

    section.saveSectionAccess();

    expect(businessApi.updateMemberSectionAccess).toHaveBeenCalledWith(
      businessId,
      member.id,
      expect.objectContaining({ dashboardEvents: false, dashboardPending: false }),
    );
    expect(section.sectionAccessOpen()).toBe(false);
    section.openSectionAccess(section.members()[0]);
    expect(section.selectedSectionAccess().dashboardEvents).toBe(false);
    expect(section.selectedSectionAccess().dashboardPending).toBe(false);
  });

  it('no confirma el guardado si la API ignora las casillas nuevas', () => {
    const section = create();
    const member = {
      id: 'staff-2',
      role: 'account_staff',
      sectionAccess: {
        dashboard: true,
        dashboardSummary: true,
        dashboardIncomeTable: true,
        businessData: true,
        reports: true,
      },
    } as any;
    section.members.set([member]);
    section.openSectionAccess(member);
    section.toggleSectionAccess('dashboardEvents', false);
    businessApi.updateMemberSectionAccess.mockReturnValue(of({ membership: member }));

    section.saveSectionAccess();

    expect(section.sectionAccessOpen()).toBe(true);
    expect(section.error()).toContain('No se guardaron');
    expect(section.members()[0].sectionAccess?.dashboardEvents).toBeUndefined();
  });

  describe('tope de pagos por opción (directa: 5, llave: todos)', () => {
    const direct = 'direct-account:ba-1';
    const bankAccount = {
      id: 'ba-1',
      bankId: 'bancolombia',
      accountNumberLast4: '2303',
      isActive: true,
      breBKeys: ['0090995395', '0091275512'],
      breBKeysDisplay: ['0090995395', '0091275512'],
    } as any;

    function openWith(sourceEventAccess: Record<string, unknown>) {
      const section = create();
      const member = { id: 'staff-3', role: 'account_staff', sourceEventAccess } as any;
      section.bankAccounts.set([bankAccount]);
      section.members.set([member]);
      section.openAccess(member);
      businessApi.updateMemberSourceEventAccess.mockImplementation(
        (_businessId, _memberId, requested) =>
          of({ membership: { ...member, sourceEventAccess: requested } }),
      );
      return section;
    }

    it('con un tope manda los filtros explícitos aunque estén todos marcados', () => {
      const section = openWith({ enabled: true, bankAccountIds: [], allowedBreBKeys: [] });

      expect(section.accessLimitValue(direct)).toBe('all');
      section.setAccessLimit(direct, '5');
      section.saveAccess();

      expect(businessApi.updateMemberSourceEventAccess).toHaveBeenCalledWith(
        businessId,
        'staff-3',
        {
          enabled: true,
          bankAccountIds: [],
          allowedBreBKeys: [direct, '0090995395', '0091275512'],
          filterLimits: [{ filter: direct, limit: 5 }],
        },
      );
    });

    it('al reabrir muestra el tope guardado y "Todos los pagos" lo quita', () => {
      const section = openWith({
        enabled: true,
        bankAccountIds: [],
        allowedBreBKeys: [direct, '0090995395'],
        filterLimits: [{ filter: direct, limit: 5 }],
      });

      expect(section.accessLimitValue(direct)).toBe('5');
      expect(section.accessLimitValue('0090995395')).toBe('all');
      section.setAccessLimit(direct, 'all');
      section.saveAccess();

      expect(businessApi.updateMemberSourceEventAccess).toHaveBeenLastCalledWith(
        businessId,
        'staff-3',
        expect.objectContaining({
          allowedBreBKeys: [direct, '0090995395'],
          filterLimits: [],
        }),
      );
    });

    it('no manda el tope de una opción desmarcada', () => {
      const section = openWith({ enabled: true, bankAccountIds: [], allowedBreBKeys: [] });

      section.setAccessLimit('0091275512', '10');
      section.toggleAccessBreBKey('0091275512', false);
      section.saveAccess();

      expect(businessApi.updateMemberSourceEventAccess).toHaveBeenLastCalledWith(
        businessId,
        'staff-3',
        expect.objectContaining({
          allowedBreBKeys: [direct, '0090995395'],
          filterLimits: [],
        }),
      );
    });

    it('describe los topes en el resumen del botón de acceso', () => {
      const section = create();
      section.bankAccounts.set([bankAccount]);

      expect(
        section.accessSummary({
          id: 'staff-4',
          role: 'account_staff',
          sourceEventAccess: {
            enabled: true,
            bankAccountIds: [],
            allowedBreBKeys: [direct, '0090995395'],
            filterLimits: [{ filter: direct, limit: 5 }],
          },
        } as any),
      ).toBe('1 cuenta(s), 2 filtro(s) (directa: últimos 5)');
    });
  });

  it('genera un QR que codifica exactamente el link de registro', async () => {
    const section = create();

    await vi.waitFor(() => expect(section.qrDataUrl()).not.toBe(''));

    expect(section.qrDataUrl().startsWith('data:image/png;base64,')).toBe(true);
    expect(section.qrError()).toBe('');
  });

  it('copyRegistrationLink copia el link completo al portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const section = create();

    section.copyRegistrationLink();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith(section.registrationLink());
    expect(section.linkCopied()).toBe(true);
  });
});
