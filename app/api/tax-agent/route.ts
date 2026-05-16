import { randomUUID } from "node:crypto";
import { Agent, Runner, tool, type RunContext } from "@openai/agents";
import { prompt } from "@promptbook/utils";
import { z } from "zod";
import type {
  TaxApplicationState,
  TaxDocument,
  TaxDocumentKind,
  VatRatePercent,
} from "@/lib/tax-calculations";
import {
  calculateTaxComputationResult,
  normalizeTaxApplicationState,
  roundCurrency,
} from "@/lib/tax-calculations";

/** Ensures the OpenAI Agents SDK runs in the Node.js runtime. */
export const runtime = "nodejs";

/** Prevents static optimization for the chat route. */
export const dynamic = "force-dynamic";

/** Maximum number of prior chat messages sent to the agent as conversation context. */
const MAX_CHAT_HISTORY_MESSAGES = 10;

/** Maximum length accepted for one user chat message. */
const MAX_CHAT_MESSAGE_LENGTH = 4_000;

/** Maximum number of agent turns for one chat request. */
const MAX_AGENT_TURNS = 8;

/** Prefix used for tax documents created by the AI agent tools. */
const AI_AGENT_TAX_DOCUMENT_ID_PREFIX = "agent";

/** Czech fallback response used when server credentials are not configured. */
const MISSING_OPENAI_API_KEY_MESSAGE =
  "AI asistent není dostupný, protože na serveru chybí proměnná `OPENAI_API_KEY`.";

/** Czech fallback response used when the agent cannot complete a request. */
const AI_AGENT_ERROR_MESSAGE =
  "Omlouvám se, požadavek se nepodařilo zpracovat. Zkuste ho prosím upřesnit.";

/** Runtime schema for supported chat message roles. */
const AI_AGENT_CHAT_MESSAGE_ROLE_SCHEMA = z.enum(["user", "assistant"]);

/** Runtime schema for chat messages sent from the browser. */
const AI_AGENT_CHAT_MESSAGE_SCHEMA = z.object({
  role: AI_AGENT_CHAT_MESSAGE_ROLE_SCHEMA,
  content: z.string().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
});

/** Runtime schema for the route request body. */
const AI_AGENT_CHAT_REQUEST_SCHEMA = z.object({
  message: z.string().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
  taxApplicationState: z.unknown(),
  chatMessages: z
    .array(AI_AGENT_CHAT_MESSAGE_SCHEMA)
    .max(MAX_CHAT_HISTORY_MESSAGES)
    .optional(),
});

/** Runtime schema for document kinds accepted by agent tools. */
const TAX_DOCUMENT_KIND_SCHEMA = z.enum(["issued", "received"]);

/** Runtime schema for VAT rates accepted by agent tools. */
const VAT_RATE_PERCENT_SCHEMA = z.union([
  z.literal(21),
  z.literal(12),
  z.literal(0),
]);

/** Runtime schema for identifying one existing tax document. */
const TAX_DOCUMENT_SELECTOR_SCHEMA = z.object({
  id: z.string().min(1).optional(),
  documentNumber: z.string().min(1).optional(),
  kind: TAX_DOCUMENT_KIND_SCHEMA.optional(),
  partnerName: z.string().min(1).optional(),
});

/** Runtime schema for adding a tax document from the agent. */
const ADD_TAX_DOCUMENT_SCHEMA = z.object({
  kind: TAX_DOCUMENT_KIND_SCHEMA,
  documentNumber: z.string().min(1),
  partnerName: z.string().min(1),
  taxableDate: z.string().min(1),
  description: z.string(),
  baseAmount: z.number().nonnegative(),
  vatRatePercent: VAT_RATE_PERCENT_SCHEMA,
});

/** Runtime schema for editable tax document fields. */
const TAX_DOCUMENT_UPDATES_SCHEMA = z.object({
  kind: TAX_DOCUMENT_KIND_SCHEMA.optional(),
  documentNumber: z.string().min(1).optional(),
  partnerName: z.string().min(1).optional(),
  taxableDate: z.string().min(1).optional(),
  description: z.string().optional(),
  baseAmount: z.number().nonnegative().optional(),
  vatRatePercent: VAT_RATE_PERCENT_SCHEMA.optional(),
});

/** Runtime schema for editing a tax document from the agent. */
const EDIT_TAX_DOCUMENT_SCHEMA = z.object({
  selector: TAX_DOCUMENT_SELECTOR_SCHEMA,
  updates: TAX_DOCUMENT_UPDATES_SCHEMA,
});

/** Runtime schema for deleting a tax document from the agent. */
const DELETE_TAX_DOCUMENT_SCHEMA = z.object({
  selector: TAX_DOCUMENT_SELECTOR_SCHEMA,
});

/** Runtime schema for reading the workspace without parameters. */
const GET_TAX_WORKSPACE_DATA_SCHEMA = z.object({});

/** One chat message from the browser conversation transcript. */
interface AiAgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Parsed and validated request body for the agent route. */
interface AiAgentChatRequest {
  message: string;
  taxApplicationState: unknown;
  chatMessages?: AiAgentChatMessage[];
}

/** JSON response returned to the floating chat bubble. */
interface AiAgentChatResponse {
  assistantMessage: string;
  taxApplicationState: TaxApplicationState;
  isTaxApplicationStateChanged: boolean;
  appliedChangeMessages: string[];
}

/** Mutable state available to all tax agent tools during one run. */
interface TaxAgentRunContext {
  taxApplicationState: TaxApplicationState;
  appliedChangeMessages: string[];
}

/** Structured data returned by the read-only workspace tool. */
interface TaxWorkspaceSnapshot {
  companyProfile: TaxApplicationState["companyProfile"];
  taxDocuments: TaxDocument[];
  taxComputationResult: ReturnType<typeof calculateTaxComputationResult>;
}

/** Result returned by document mutation tools. */
interface TaxDocumentMutationResult {
  isSuccess: boolean;
  message: string;
  taxWorkspaceSnapshot: TaxWorkspaceSnapshot;
}

/** Selector fields used to find one tax document for mutation. */
interface TaxDocumentSelector {
  id?: string;
  documentNumber?: string;
  kind?: TaxDocumentKind;
  partnerName?: string;
}

/** Editable fields for one existing tax document. */
interface TaxDocumentUpdates {
  kind?: TaxDocumentKind;
  documentNumber?: string;
  partnerName?: string;
  taxableDate?: string;
  description?: string;
  baseAmount?: number;
  vatRatePercent?: VatRatePercent;
}

/** System prompt for the Czech tax workspace agent. */
const TAX_AGENT_SYSTEM_PROMPT = String(prompt`
    Jsi AI asistent pro českou MVP aplikaci na přehled DPH a daně z příjmů s.r.o.

    Komunikuj výhradně česky a používej diakritiku.
    Před každou odpovědí si načti aktuální data nástrojem \`get_tax_workspace_data\`.
    Odpovídej pouze z dat dostupných přes nástroje a z výsledků nástrojů.
    Když uživatel žádá přidání, úpravu nebo smazání daňového dokladu, použij k tomu příslušný nástroj.
    Nikdy netvrď, že byla provedena změna, pokud nástroj nevrátil úspěch.
    Pokud je zadání nejednoznačné, požádej uživatele o upřesnění a neměň data.
    Neposkytuj závazné daňové poradenství; u složitějších situací doporuč ověření účetním nebo daňovým poradcem.
`);

/** Runner configured to avoid tracing local tax data from the MVP workspace. */
const TAX_AGENT_RUNNER = new Runner({
  tracingDisabled: true,
  traceIncludeSensitiveData: false,
  workflowName: "Czech tax workspace assistant",
});

/**
 * Returns the mutable agent context passed to tool executions.
 *
 * @param runContext Current OpenAI Agents SDK run context.
 * @returns Mutable tax agent run context.
 */
function getTaxAgentRunContext(
  runContext?: RunContext<TaxAgentRunContext>,
): TaxAgentRunContext {
  if (!runContext) {
    throw new Error("Tax agent tool context is missing.");
  }

  return runContext.context;
}

/**
 * Creates a read snapshot of the current tax workspace for tools and responses.
 *
 * @param taxApplicationState Current tax application state.
 * @returns Company profile, documents, and computed tax summaries.
 */
function createTaxWorkspaceSnapshot(
  taxApplicationState: TaxApplicationState,
): TaxWorkspaceSnapshot {
  return {
    companyProfile: taxApplicationState.companyProfile,
    taxDocuments: taxApplicationState.taxDocuments,
    taxComputationResult: calculateTaxComputationResult(
      taxApplicationState.taxDocuments,
    ),
  };
}

/**
 * Formats a candidate list for an ambiguous document selector.
 *
 * @param taxDocuments Candidate documents.
 * @returns Human-readable candidate summary for the agent.
 */
function formatTaxDocumentCandidates(taxDocuments: TaxDocument[]): string {
  return taxDocuments
    .map(
      (taxDocument) =>
        `${taxDocument.id} (${taxDocument.kind}, ${taxDocument.documentNumber}, ${taxDocument.partnerName})`,
    )
    .join("; ");
}

/**
 * Finds documents matching the agent-provided selector.
 *
 * @param taxDocuments Available tax documents.
 * @param selector Selector from the agent tool call.
 * @returns Matching tax documents.
 */
function findTaxDocumentsBySelector(
  taxDocuments: TaxDocument[],
  selector: TaxDocumentSelector,
): TaxDocument[] {
  const normalizedId = selector.id?.trim().toLowerCase();
  const normalizedDocumentNumber = selector.documentNumber?.trim().toLowerCase();
  const normalizedPartnerName = selector.partnerName?.trim().toLowerCase();

  if (!normalizedId && !normalizedDocumentNumber && !normalizedPartnerName) {
    return [];
  }

  return taxDocuments.filter((taxDocument) => {
    const isIdMatching =
      !normalizedId || taxDocument.id.toLowerCase() === normalizedId;
    const isDocumentNumberMatching =
      !normalizedDocumentNumber ||
      taxDocument.documentNumber.toLowerCase() === normalizedDocumentNumber;
    const isKindMatching = !selector.kind || taxDocument.kind === selector.kind;
    const isPartnerMatching =
      !normalizedPartnerName ||
      taxDocument.partnerName.toLowerCase() === normalizedPartnerName;

    return (
      isIdMatching &&
      isDocumentNumberMatching &&
      isKindMatching &&
      isPartnerMatching
    );
  });
}

/**
 * Resolves exactly one document for a mutation tool.
 *
 * @param taxApplicationState Current tax application state.
 * @param selector Selector from the agent tool call.
 * @returns Either the resolved document or a Czech error message.
 */
function resolveSingleTaxDocument(
  taxApplicationState: TaxApplicationState,
  selector: TaxDocumentSelector,
): { taxDocument?: TaxDocument; errorMessage?: string } {
  const matchingTaxDocuments = findTaxDocumentsBySelector(
    taxApplicationState.taxDocuments,
    selector,
  );

  if (matchingTaxDocuments.length === 1) {
    return { taxDocument: matchingTaxDocuments[0] };
  }

  if (matchingTaxDocuments.length > 1) {
    return {
      errorMessage: `Výběr dokladu je nejednoznačný. Kandidáti: ${formatTaxDocumentCandidates(
        matchingTaxDocuments,
      )}.`,
    };
  }

  return {
    errorMessage:
      "Doklad podle zadaných údajů nebyl nalezen. Požádej uživatele o přesné číslo dokladu nebo další upřesnění.",
  };
}

/**
 * Creates a tool result after a document mutation.
 *
 * @param taxApplicationState Current tax application state after the mutation.
 * @param isSuccess Whether the mutation succeeded.
 * @param message Czech result message for the agent.
 * @returns Structured mutation result.
 */
function createTaxDocumentMutationResult(
  taxApplicationState: TaxApplicationState,
  isSuccess: boolean,
  message: string,
): TaxDocumentMutationResult {
  return {
    isSuccess,
    message,
    taxWorkspaceSnapshot: createTaxWorkspaceSnapshot(taxApplicationState),
  };
}

/**
 * Creates the user prompt for one agent run.
 *
 * @param message Current user request.
 * @param chatMessages Recent chat transcript.
 * @returns Promptbook prompt string for the agent run.
 */
function createTaxAgentUserPrompt(
  message: string,
  chatMessages: AiAgentChatMessage[] = [],
): string {
  const conversationHistory = chatMessages
    .slice(-MAX_CHAT_HISTORY_MESSAGES)
    .map((chatMessage) => {
      const speakerLabel =
        chatMessage.role === "user" ? "Uživatel" : "Asistent";

      return `${speakerLabel}: ${chatMessage.content}`;
    })
    .join("\n\n");

  return String(prompt`
      Historie posledních zpráv:
      ${conversationHistory || "Bez předchozí historie."}

      Aktuální požadavek uživatele:
      ${message}
  `);
}

/**
 * Converts the agent final output into a non-empty Czech message.
 *
 * @param finalOutput Final output returned by the OpenAI Agents SDK.
 * @returns Assistant message for the browser.
 */
function getAgentFinalOutputMessage(finalOutput: unknown): string {
  if (typeof finalOutput === "string" && finalOutput.trim()) {
    return finalOutput.trim();
  }

  return "Hotovo. Zkontrolujte prosím aktuální data v aplikaci.";
}

/**
 * Parses the incoming route request body.
 *
 * @param request Incoming HTTP request.
 * @returns Validated chat request, or `null` when the body is invalid.
 */
async function parseAiAgentChatRequest(
  request: Request,
): Promise<AiAgentChatRequest | null> {
  const requestBody = await request.json().catch(() => null);
  const parsedRequest = AI_AGENT_CHAT_REQUEST_SCHEMA.safeParse(requestBody);

  if (!parsedRequest.success) {
    return null;
  }

  return parsedRequest.data;
}

/** Tool for reading the current workspace and computed summaries. */
const GET_TAX_WORKSPACE_DATA_TOOL = tool<
  typeof GET_TAX_WORKSPACE_DATA_SCHEMA,
  TaxAgentRunContext,
  TaxWorkspaceSnapshot
>({
  name: "get_tax_workspace_data",
  description: String(prompt`
      Načte aktuální profil firmy, všechny daňové doklady a vypočtené souhrny DPH i daně z příjmů.
      Použij vždy před odpovědí nebo před změnou dokladů.
  `),
  parameters: GET_TAX_WORKSPACE_DATA_SCHEMA,
  execute: (_input, runContext?: RunContext<TaxAgentRunContext>) => {
    const taxAgentRunContext = getTaxAgentRunContext(runContext);

    return createTaxWorkspaceSnapshot(taxAgentRunContext.taxApplicationState);
  },
});

/** Tool for adding one issued or received tax document. */
const ADD_TAX_DOCUMENT_TOOL = tool<
  typeof ADD_TAX_DOCUMENT_SCHEMA,
  TaxAgentRunContext,
  TaxDocumentMutationResult
>({
  name: "add_tax_document",
  description: String(prompt`
      Přidá jeden vydaný nebo přijatý daňový doklad do aktuálních dat aplikace.
      Hodnota \`baseAmount\` je základ daně bez DPH v Kč.
  `),
  parameters: ADD_TAX_DOCUMENT_SCHEMA,
  execute: (input, runContext?: RunContext<TaxAgentRunContext>) => {
    const taxAgentRunContext = getTaxAgentRunContext(runContext);
    const nextTaxDocument: TaxDocument = {
      id: `${AI_AGENT_TAX_DOCUMENT_ID_PREFIX}-${input.kind}-${randomUUID()}`,
      kind: input.kind,
      documentNumber: input.documentNumber.trim(),
      partnerName: input.partnerName.trim(),
      taxableDate: input.taxableDate.trim(),
      description: input.description.trim(),
      baseAmount: roundCurrency(input.baseAmount),
      vatRatePercent: input.vatRatePercent,
    };

    taxAgentRunContext.taxApplicationState = {
      ...taxAgentRunContext.taxApplicationState,
      taxDocuments: [
        nextTaxDocument,
        ...taxAgentRunContext.taxApplicationState.taxDocuments,
      ],
    };

    const message = `Doklad \`${nextTaxDocument.documentNumber}\` byl přidán.`;
    taxAgentRunContext.appliedChangeMessages.push(message);

    return createTaxDocumentMutationResult(
      taxAgentRunContext.taxApplicationState,
      true,
      message,
    );
  },
});

/** Tool for editing one existing tax document. */
const EDIT_TAX_DOCUMENT_TOOL = tool<
  typeof EDIT_TAX_DOCUMENT_SCHEMA,
  TaxAgentRunContext,
  TaxDocumentMutationResult
>({
  name: "edit_tax_document",
  description: String(prompt`
      Upraví jeden existující daňový doklad podle \`id\`, přesného čísla dokladu nebo kombinace čísla, typu a partnera.
      Pokud je výběr nejednoznačný, vrať se k uživateli pro upřesnění.
  `),
  parameters: EDIT_TAX_DOCUMENT_SCHEMA,
  execute: (input, runContext?: RunContext<TaxAgentRunContext>) => {
    const taxAgentRunContext = getTaxAgentRunContext(runContext);
    const { taxDocument, errorMessage } = resolveSingleTaxDocument(
      taxAgentRunContext.taxApplicationState,
      input.selector,
    );

    if (!taxDocument) {
      return createTaxDocumentMutationResult(
        taxAgentRunContext.taxApplicationState,
        false,
        errorMessage ?? "Doklad se nepodařilo jednoznačně určit.",
      );
    }

    const updates: TaxDocumentUpdates = input.updates;
    const updatedTaxDocument: TaxDocument = {
      ...taxDocument,
      kind: updates.kind ?? taxDocument.kind,
      documentNumber:
        updates.documentNumber?.trim() ?? taxDocument.documentNumber,
      partnerName: updates.partnerName?.trim() ?? taxDocument.partnerName,
      taxableDate: updates.taxableDate?.trim() ?? taxDocument.taxableDate,
      description: updates.description?.trim() ?? taxDocument.description,
      baseAmount:
        updates.baseAmount === undefined
          ? taxDocument.baseAmount
          : roundCurrency(updates.baseAmount),
      vatRatePercent: updates.vatRatePercent ?? taxDocument.vatRatePercent,
    };

    taxAgentRunContext.taxApplicationState = {
      ...taxAgentRunContext.taxApplicationState,
      taxDocuments: taxAgentRunContext.taxApplicationState.taxDocuments.map(
        (currentTaxDocument) =>
          currentTaxDocument.id === taxDocument.id
            ? updatedTaxDocument
            : currentTaxDocument,
      ),
    };

    const message = `Doklad \`${updatedTaxDocument.documentNumber}\` byl upraven.`;
    taxAgentRunContext.appliedChangeMessages.push(message);

    return createTaxDocumentMutationResult(
      taxAgentRunContext.taxApplicationState,
      true,
      message,
    );
  },
});

/** Tool for deleting one existing tax document. */
const DELETE_TAX_DOCUMENT_TOOL = tool<
  typeof DELETE_TAX_DOCUMENT_SCHEMA,
  TaxAgentRunContext,
  TaxDocumentMutationResult
>({
  name: "delete_tax_document",
  description: String(prompt`
      Smaže jeden existující daňový doklad podle \`id\`, přesného čísla dokladu nebo kombinace čísla, typu a partnera.
      Pokud je výběr nejednoznačný, vrať se k uživateli pro upřesnění.
  `),
  parameters: DELETE_TAX_DOCUMENT_SCHEMA,
  execute: (input, runContext?: RunContext<TaxAgentRunContext>) => {
    const taxAgentRunContext = getTaxAgentRunContext(runContext);
    const { taxDocument, errorMessage } = resolveSingleTaxDocument(
      taxAgentRunContext.taxApplicationState,
      input.selector,
    );

    if (!taxDocument) {
      return createTaxDocumentMutationResult(
        taxAgentRunContext.taxApplicationState,
        false,
        errorMessage ?? "Doklad se nepodařilo jednoznačně určit.",
      );
    }

    taxAgentRunContext.taxApplicationState = {
      ...taxAgentRunContext.taxApplicationState,
      taxDocuments: taxAgentRunContext.taxApplicationState.taxDocuments.filter(
        (currentTaxDocument) => currentTaxDocument.id !== taxDocument.id,
      ),
    };

    const message = `Doklad \`${taxDocument.documentNumber}\` byl smazán.`;
    taxAgentRunContext.appliedChangeMessages.push(message);

    return createTaxDocumentMutationResult(
      taxAgentRunContext.taxApplicationState,
      true,
      message,
    );
  },
});

/** Czech agent with tool access to the local tax workspace copy. */
const TAX_AGENT = new Agent<TaxAgentRunContext>({
  name: "Český daňový asistent",
  instructions: TAX_AGENT_SYSTEM_PROMPT,
  tools: [
    GET_TAX_WORKSPACE_DATA_TOOL,
    ADD_TAX_DOCUMENT_TOOL,
    EDIT_TAX_DOCUMENT_TOOL,
    DELETE_TAX_DOCUMENT_TOOL,
  ],
});

/**
 * Handles a chat turn from the floating AI tax assistant.
 *
 * @param request Incoming HTTP request.
 * @returns JSON chat response with the current or updated workspace state.
 */
export async function POST(request: Request): Promise<Response> {
  const parsedRequest = await parseAiAgentChatRequest(request);

  if (!parsedRequest) {
    return Response.json(
      { errorMessage: "Požadavek pro AI asistenta není platný." },
      { status: 400 },
    );
  }

  const initialTaxApplicationState = normalizeTaxApplicationState(
    parsedRequest.taxApplicationState,
  );

  if (!process.env.OPENAI_API_KEY) {
    const response: AiAgentChatResponse = {
      assistantMessage: MISSING_OPENAI_API_KEY_MESSAGE,
      taxApplicationState: initialTaxApplicationState,
      isTaxApplicationStateChanged: false,
      appliedChangeMessages: [],
    };

    return Response.json(response);
  }

  const taxAgentRunContext: TaxAgentRunContext = {
    taxApplicationState: initialTaxApplicationState,
    appliedChangeMessages: [],
  };
  const initialTaxApplicationStateJson = JSON.stringify(
    initialTaxApplicationState,
  );

  try {
    const result = await TAX_AGENT_RUNNER.run(
      TAX_AGENT,
      createTaxAgentUserPrompt(
        parsedRequest.message,
        parsedRequest.chatMessages ?? [],
      ),
      {
        context: taxAgentRunContext,
        maxTurns: MAX_AGENT_TURNS,
      },
    );
    const normalizedTaxApplicationState = normalizeTaxApplicationState(
      result.runContext.context.taxApplicationState,
    );
    const response: AiAgentChatResponse = {
      assistantMessage: getAgentFinalOutputMessage(result.finalOutput),
      taxApplicationState: normalizedTaxApplicationState,
      isTaxApplicationStateChanged:
        JSON.stringify(normalizedTaxApplicationState) !==
        initialTaxApplicationStateJson,
      appliedChangeMessages: result.runContext.context.appliedChangeMessages,
    };

    return Response.json(response);
  } catch (error) {
    console.error(error);

    const response: AiAgentChatResponse = {
      assistantMessage: AI_AGENT_ERROR_MESSAGE,
      taxApplicationState: initialTaxApplicationState,
      isTaxApplicationStateChanged: false,
      appliedChangeMessages: [],
    };

    return Response.json(response, { status: 500 });
  }
}
