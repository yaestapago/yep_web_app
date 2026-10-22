/** Contrato de `/admin/assistant/*` (panel de superadmin de Zaira; ver API_CONTRACTS.md del backend). */

export type AssistantIncidentKind =
  | 'injection_suspect'
  | 'sensitive_shared'
  | 'tool_denied'
  | 'no_answer'
  | 'budget_reached'
  | 'long_conversation';

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

export type AssistantTranscriptRole = 'user' | 'assistant' | 'tool_call' | 'tool_result';

export interface AssistantTranscriptEntry {
  role: AssistantTranscriptRole;
  text: string;
  toolName?: string;
  isError?: boolean;
}

export interface AssistantConversationDetail extends AssistantConversationSummary {
  model: string;
  contextText: string;
  createdAt: string;
  incidents: AssistantIncident[];
  transcript: AssistantTranscriptEntry[];
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
  q?: string;
  cursor?: string;
  limit?: number;
}
