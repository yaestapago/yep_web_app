/** Contrato de `/admin/assistant/*` (panel de superadmin de Zaira; ver API_CONTRACTS.md del backend). */

export type AssistantIncidentKind =
  | 'injection_suspect'
  | 'sensitive_shared'
  | 'tool_denied'
  | 'no_answer'
  | 'budget_reached'
  | 'long_conversation'
  | 'bad_feedback'
  | 'output_guard'
  | 'escalated';

export interface AssistantAdminAccountRef {
  id: string;
  name: string;
}

export interface AssistantConversationSummary {
  id: string;
  account: AssistantAdminAccountRef | null;
  user: { id: string; name: string; email: string } | null;
  userTurns: number;
  costUsd: number;
  costCop: number;
  flags: AssistantIncidentKind[];
  lastMessageAt: string;
  /** Última pregunta, enmascarada; `null` en conversaciones anteriores al panel. */
  preview: string | null;
}

export interface AssistantConversationPage {
  conversations: AssistantConversationSummary[];
  nextCursor?: string;
}

export interface AssistantIncident {
  at: string;
  kind: AssistantIncidentKind;
  text?: string;
}

export type AssistantTranscriptRole = 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result';

export interface AssistantTranscriptEntry {
  role: AssistantTranscriptRole;
  text: string;
  toolName?: string;
  isError?: boolean;
  /** Solo en `system`: qué agregó YEP al mensaje ("Guía precargada: correo-gmail", "Pantalla abierta"). */
  label?: string;
}

export type AssistantTurnOutcome =
  | 'guide'
  | 'answer'
  | 'no_answer'
  | 'budget_reached'
  | 'cancelled'
  | 'error';

/** Medición de un turno. No siempre tiene mensajes en la transcripción: por eso va aparte. */
export interface AssistantTurnLogEntry {
  at: string;
  outcome: AssistantTurnOutcome;
  /** Por qué no hubo respuesta. */
  cause?: string;
  latencyMs: number;
  /** Llamadas al modelo del turno. */
  rounds: number;
  /** Herramientas que corrió el modelo, en orden y con repetidas. */
  tools: string[];
}

export interface AssistantConversationDetail extends AssistantConversationSummary {
  model: string;
  contextText: string;
  createdAt: string;
  incidents: AssistantIncident[];
  transcript: AssistantTranscriptEntry[];
  /** Los últimos turnos. Ausente en un backend que aún no lo devuelve. */
  turnLog?: AssistantTurnLogEntry[];
}

export interface AssistantUsageRow {
  account: AssistantAdminAccountRef | null;
  scopeType: 'account' | 'user';
  costCop: number;
  questions: number;
  requests: number;
  percentOfBudget: number;
}

export interface AssistantUsage {
  month: string;
  budgetCop: number;
  totals: { costCop: number; questions: number; accounts: number; conversations: number };
  accounts: AssistantUsageRow[];
}

export interface AssistantConversationQuery {
  flagged?: boolean;
  /** `down`: solo las que tienen alguna respuesta mal calificada. */
  feedback?: 'down';
  q?: string;
  cursor?: string;
  limit?: number;
}
