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
 * Cubre cómo el owner comparte la invitación al negocio: el código corto
 * (últimos 6 caracteres del id), el link de registro que lo empaqueta, y el
 * QR que codifica ese mismo link — deben ser consistentes entre sí, porque
 * son las tres puertas de entrada que resuelve `lookupByCode` en el backend.
 */
describe('BusinessEmployeesSection — compartir invitación (código/link/QR)', () => {
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
  };

  function create(): BusinessEmployeesSection {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSessionService, useValue: session },
        { provide: BusinessAccountsApiService, useValue: businessApi },
        { provide: NotificationModalService, useValue: { confirm: vi.fn() } },
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

  it('genera un QR que codifica exactamente el link de registro', async () => {
    const section = create();

    await vi.waitFor(() => expect(section.qrDataUrl()).not.toBe(''));

    expect(section.qrDataUrl().startsWith('data:image/png;base64,')).toBe(true);
    expect(section.qrError()).toBe('');
  });

  it('copyCode copia el código corto al portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const section = create();

    section.copyCode();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith(businessId.slice(-6).toUpperCase());
    expect(section.copied()).toBe(true);
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
