import {
  canAccessBusinessSection,
  canViewDashboardIncomeTable,
  canViewDashboardSummary,
} from './business-section-access';

describe('canAccessBusinessSection', () => {
  it('defaults legacy staff permissions to enabled', () => {
    expect(canAccessBusinessSection('dashboard', 'account_staff')).toBe(true);
    expect(canAccessBusinessSection('business-data', 'account_staff')).toBe(true);
    expect(canAccessBusinessSection('reports', 'account_staff')).toBe(true);
  });

  it('honors explicit staff section restrictions', () => {
    const access = {
      dashboard: false,
      businessData: true,
      reports: false,
      dashboardSummary: true,
      dashboardIncomeTable: true,
    };
    expect(canAccessBusinessSection('dashboard', 'account_staff', false, access)).toBe(false);
    expect(canAccessBusinessSection('business-data', 'account_staff', false, access)).toBe(true);
    expect(canAccessBusinessSection('reports', 'account_staff', false, access)).toBe(false);
  });

  it('does not restrict owners or superusers with staff configuration', () => {
    const access = {
      dashboard: false,
      businessData: false,
      reports: false,
      dashboardSummary: false,
      dashboardIncomeTable: false,
    };
    expect(canAccessBusinessSection('dashboard', 'account_owner', false, access)).toBe(true);
    expect(canAccessBusinessSection('reports', 'account_staff', true, access)).toBe(true);
  });
});

describe('canViewDashboardSummary / canViewDashboardIncomeTable', () => {
  it('defaults legacy staff permissions to enabled', () => {
    expect(canViewDashboardSummary('account_staff')).toBe(true);
    expect(canViewDashboardIncomeTable('account_staff')).toBe(true);
  });

  it('honors explicit staff sub-section restrictions', () => {
    const access = {
      dashboard: true,
      businessData: true,
      reports: true,
      dashboardSummary: false,
      dashboardIncomeTable: false,
    };
    expect(canViewDashboardSummary('account_staff', false, access)).toBe(false);
    expect(canViewDashboardIncomeTable('account_staff', false, access)).toBe(false);
  });

  it('does not restrict owners or superusers', () => {
    const access = {
      dashboard: true,
      businessData: true,
      reports: true,
      dashboardSummary: false,
      dashboardIncomeTable: false,
    };
    expect(canViewDashboardSummary('account_owner', false, access)).toBe(true);
    expect(canViewDashboardIncomeTable('account_staff', true, access)).toBe(true);
  });
});