import type { TaxApplicationState } from "@/lib/tax-calculations";

/** One visible chat message shown inside the floating AI agent UI. */
export interface AiAgentChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Request body sent from the floating client widget to the AI route handler. */
export interface AiAgentRequestBody {
  messages: AiAgentChatMessage[];
  userMessage: string;
  taxApplicationState: TaxApplicationState;
}

/** Response payload returned by the AI route handler. */
export interface AiAgentResponseBody {
  assistantMessage: string;
  nextTaxApplicationState?: TaxApplicationState;
  storageStatusMessage?: string;
}
