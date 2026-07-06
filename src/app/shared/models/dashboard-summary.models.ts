import type { SourceEventStatus, SourceEventType } from './source-event.models';
import type { TransactionStatus } from './transaction.models';

export type DashboardSemaphoreLevel = 'green' | 'yellow' | 'red';
export type DashboardAlertSeverity = 'yellow' | 'red';
export type DashboardAlertType =
  | 'notifier_failure'
  | 'gmail_credentials'
  | 'manual_review_transaction'
  | 'failed_event';

export interface DashboardDateRange {
  from: string;
  to: string;
}

export interface DashboardKpis {
  totalAmount: number;
  paidCount: number;
  reviewCount: number;
  receivedCount: number;
  pendingCount: number;
  rejectedCount: number;
  eventsCount: number;
  attentionCount: number;
}

export interface DashboardChartAmountPoint {
  key: string;
  amount: number;
}

export interface DashboardChartCountPoint<T = string> {
  key: T;
  count: number;
}

export interface DashboardChartsSummary {
  bankAmounts: DashboardChartAmountPoint[];
  dailyCaptured: DashboardChartAmountPoint[];
  statusDistribution: DashboardChartCountPoint<TransactionStatus>[];
  paidVsPending: DashboardChartCountPoint<'paid' | 'pending'>[];
  eventsBySource: DashboardChartCountPoint<SourceEventType>[];
  eventsByStatus: DashboardChartCountPoint<SourceEventStatus>[];
}

export interface DashboardSemaphoreSummary {
  level: DashboardSemaphoreLevel;
  label: string;
  detail: string;
}

export interface DashboardAlert {
  id: string;
  type: DashboardAlertType;
  severity: DashboardAlertSeverity;
  title: string;
  detail: string;
  count: number;
}

export interface DashboardSummary {
  range: DashboardDateRange;
  kpis: DashboardKpis;
  charts: DashboardChartsSummary;
  semaphore: DashboardSemaphoreSummary;
  alerts: DashboardAlert[];
  chartNotes?: {
    current: string;
    proposed: string;
  };
}
