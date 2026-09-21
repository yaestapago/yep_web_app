import {
  canAccessBusinessSection,
  canViewDashboardIncomeTable,
  canViewDashboardSummary,
  canViewDashboardSummaryPart,
} from './business-section-access';

const summaryParts = {
  dashboardCharts: true,
  dashboardSystemStatus: true,
  dashboardTotalAmount: true,
  dashboardEvents: true,
  dashboardReceived: true,
  dashboardPending: true,
  dashboardRejected: true,
};

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
      ...summaryParts,
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
      ...summaryParts,
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
      ...summaryParts,
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
      ...summaryParts,
    };
    expect(canViewDashboardSummary('account_owner', false, access)).toBe(true);
    expect(canViewDashboardIncomeTable('account_staff', true, access)).toBe(true);
  });
});

describe('canViewDashboardSummaryPart', () => {
  it('preserves legacy visibility when the new fields are absent', () => {
    expect(canViewDashboardSummaryPart('dashboardCharts', 'account_staff')).toBe(true);
    expect(canViewDashboardSummaryPart('dashboardTotalAmount', 'account_staff')).toBe(true);
  });

  it('honors each explicit staff restriction while owners and SU retain access', () => {
    const access = {
      dashboard: true,
      businessData: true,
      reports: true,
      dashboardSummary: true,
      dashboardIncomeTable: true,
      dashboardCharts: false,
      dashboardSystemStatus: true,
      dashboardTotalAmount: false,
      dashboardEvents: true,
      dashboardReceived: true,
      dashboardPending: true,
      dashboardRejected: true,
    };

    expect(canViewDashboardSummaryPart('dashboardCharts', 'account_staff', false, access)).toBe(false);
    expect(canViewDashboardSummaryPart('dashboardTotalAmount', 'account_staff', false, access)).toBe(false);
    expect(canViewDashboardSummaryPart('dashboardEvents', 'account_staff', false, access)).toBe(true);
    expect(canViewDashboardSummaryPart('dashboardCharts', 'account_owner', false, access)).toBe(true);
    expect(canViewDashboardSummaryPart('dashboardCharts', 'account_staff', true, access)).toBe(true);
  });
});
