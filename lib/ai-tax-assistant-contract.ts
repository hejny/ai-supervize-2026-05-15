import type { TaxApplicationState } from "@/lib/tax-calculations";

/** Supported message roles in the AI assistant conversation. */
export type TaxAssistantMessageRole = "user" | "assistant";

/** One chat message exchanged with the AI assistant. */
export interface TaxAssistantConversationMessage {
  role: TaxAssistantMessageRole;
  content: string;
}

/** Request body sent from the client to the AI assistant API route. */
export interface TaxAssistantRequest {
  question: string;
  conversation: TaxAssistantConversationMessage[];
  taxApplicationState: TaxApplicationState;
}

/** Successful response returned by the AI assistant API route. */
export interface TaxAssistantResponse {
  answer: string;
}

