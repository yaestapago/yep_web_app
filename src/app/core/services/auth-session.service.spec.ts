import { TestBed } from '@angular/core/testing';

import { AuthResponse, BusinessMembership, User } from '../../shared/models/auth.models';
import { AuthSessionService } from './auth-session.service';

const storageKey = 'yep_web.auth_session';

const user: User = {
  id: 'user-1',
  firstName: 'Pedro',
  lastName: 'Ramirez',
  email: 'pedro@example.com',
  identificationNumber: '123456789',
  cellphoneNumber: '3001234567',
};

const approvedMembership: BusinessMembership = {
  id: 'membership-1',
  businessAccountId: 'business-1',
  businessAccount: {
    id: 'business-1',
    name: 'Tienda Don Pedro',
    departmentCode: '11',
    departmentName: 'Bogotá D.C.',
    cityCode: '11001',
    cityName: 'Bogotá, D.C.',
    address: 'Calle 10 # 20-30',
    phone: '6011234567',
  },
  role: 'account_owner',
  status: 'approved',
  locationIds: [],
};

const pendingMembership: BusinessMembership = {
  id: 'membership-2',
  businessAccountId: 'business-2',
  role: 'account_staff',
  status: 'pending',
  locationIds: [],
};

describe('AuthSessionService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('stores memberships and selects the first approved business', () => {
    const service = TestBed.inject(AuthSessionService);
    const response: AuthResponse = {
      accessToken: 'token',
      user,
      memberships: [pendingMembership, approvedMembership],
    };

    service.saveSession(response);

    expect(service.user()).toEqual(user);
    expect(service.pendingMemberships()).toEqual([pendingMembership]);
    expect(service.approvedMemberships()).toEqual([approvedMembership]);
    expect(service.activeBusinessAccountId()).toBe('business-1');
    expect(service.onboardingRequired()).toBe(false);
  });

  it('marks onboarding as required when no membership is approved', () => {
    const service = TestBed.inject(AuthSessionService);

    service.saveSession({
      accessToken: 'token',
      user,
      memberships: [pendingMembership],
    });

    expect(service.activeBusinessAccountId()).toBeNull();
    expect(service.onboardingRequired()).toBe(true);
  });

  it('restores active business from localStorage only when it is still approved', () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        accessToken: 'token',
        user,
        memberships: [approvedMembership],
        activeBusinessAccountId: 'missing-business',
      }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const service = TestBed.inject(AuthSessionService);

    expect(service.activeBusinessAccountId()).toBe('business-1');
  });
});
