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

/** Dinero notificado hoy contra el mismo día de la semana pasada. Fijo: no depende del rango elegido arriba. */
export interface DashboardTodayVsLastWeek {
  today: number;
  lastWeek: number;
  todayDate: string;
  lastWeekDate: string;
}

/** Una celda del mapa de calor: cuántos eventos de pago notificados cayeron en ese día/hora (patrón de las últimas semanas). */
export interface DashboardHeatmapCell {
  /** 0 = lunes .. 6 = domingo. */
  dayOfWeek: number;
  /** 0-23, hora local Bogotá. */
  hour: number;
  count: number;
}

/** Un remitente y cuánto dinero te ha notificado en total (histórico, no por rango). */
export interface DashboardTopCustomerPoint {
  key: string;
  amount: number;
}

/** Dinero notificado en una semana (`key` = lunes de esa semana, 'YYYY-MM-DD'). */
export interface DashboardWeeklyTrendPoint {
  key: string;
  amount: number;
}

export interface DashboardChartsSummary {
  todayVsLastWeek: DashboardTodayVsLastWeek;
  hourlyHeatmap: DashboardHeatmapCell[];
  topCustomers: DashboardTopCustomerPoint[];
  weeklyTrend: DashboardWeeklyTrendPoint[];
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
}
