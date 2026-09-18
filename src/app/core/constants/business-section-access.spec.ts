import { canAccessBusinessSection } from './business-section-access';

describe('canAccessBusinessSection', () => {
  it('defaults legacy staff permissions to enabled', () => {
    expect(canAccessBusinessSection('dashboard', 'account_staff')).toBe(true);
    expect(canAccessBusinessSection('business-data', 'account_staff')).toBe(true);
    expect(canAccessBusinessSection('reports', 'account_staff')).toBe(true);
  });

  it('honors explicit staff section restrictions', () => {
    const access = { dashboard: false, businessData: true, reports: false };
    expect(canAccessBusinessSection('dashboard', 'account_staff', false, access)).toBe(false);
    expect(canAccessBusinessSection('business-data', 'account_staff', false, access)).toBe(true);
    expect(canAccessBusinessSection('reports', 'account_staff', false, access)).toBe(false);
  });

  it('does not restrict owners or superusers with staff configuration', () => {
    const access = { dashboard: false, businessData: false, reports: false };
    expect(canAccessBusinessSection('dashboard', 'account_owner', false, access)).toBe(true);
    expect(canAccessBusinessSection('reports', 'account_staff', true, access)).toBe(true);
  });
});