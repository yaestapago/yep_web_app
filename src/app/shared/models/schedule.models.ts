import { BusinessMembership } from './auth.models';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Domingo

/** Miembro aprobado enriquecido con datos del usuario (para asignar turnos). */
export interface ApprovedMember extends BusinessMembership {
  firstName?: string;
  lastName?: string;
  cellphoneNumber?: string;
}

export interface ApprovedMembersResponse {
  memberships: ApprovedMember[];
}

export interface Shift {
  id: string;
  businessAccountId: string;
  locationId: string;
  userId: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  timezone?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SchedulesResponse {
  shifts: Shift[];
}

export interface ShiftResponse {
  shift: Shift;
}

export interface ShiftRequest {
  locationId: string;
  userId: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  timezone?: string;
}

export type UpdateShiftRequest = Partial<ShiftRequest>;
