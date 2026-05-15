import { Agent, assistant, run, tool, user, type AgentInputItem } from "@openai/agents";
import { z } from "zod";
import {
  calculateDocumentTotals,
  calculateTaxComputationResult,
  type TaxApplicationState,
  type TaxDocument,
  type TaxDocumentKind,
} from "@/lib/tax-calculations";
import {
  addTaxDocumentToState,
  deleteTaxDocumentFromState,
  findTaxDocumentById,
  updateTaxDocumentInState,
} from "@/lib/tax-application-state";
import type {
  AiAgentChatMessage,
  AiAgentResponseBody,
} from "@/lib/ai-agent/contracts";
import {
  createTaxAiAgentUserPrompt,
  TAX_AI_AGENT_SYSTEM_PROMPT,
} from "@/lib/ai-agent/prompts";

/** Mutable execution context shared by all AI tools during one agent run. */
interface TaxAiAgentContext {
  taxApplicationState: TaxApplicationState;
}

/** Structured document payload returned to the model from read tools. */
interface TaxDocumentWithTotals extends TaxDocument {
  vatAmount: number;
  grossAmount: number;
}

/** Tool input used to narrow document searches before updates or deletions. */
const SEARCH_TAX_DOCUMENTS_SCHEMA = z.object({
  searchTerm: z
    .string()
    .min(1)
    .describe("Hledaný text, například číslo dokladu, partner nebo část poznámky."),
  kind: z
    .enum(["issued", "received"])
    .optional()
    .describe("Volitelný typ dokladu: vydaný nebo přijatý."),
});

/** Tool input used to insert a new tax document into the current workspace state. */
const ADD_TAX_DOCUMENT_SCHEMA = z.object({
  kind: z
    .enum(["issued", "received"])
    .describe("Typ dokladu: `issued` pro vydaný nebo `received` pro přijatý."),
  documentNumber: z.string().min(1).describe("Číslo dokladu."),
  partnerName: z.string().min(1).describe("Název partnera na dokladu."),
  taxableDate: z
    .string()
    .min(1)
    .describe("Datum uskutečnění zdanitelného plnění ve formátu `YYYY-MM-DD`."),
  description: z.string().describe("Poznámka nebo stručný popis dokladu."),
  baseAmount: z.number().nonnegative().describe("Základ daně v korunách."),
  vatRatePercent: z
    .union([z.literal(21), z.literal(12), z.literal(0)])
    .describe("Sazba DPH v procentech."),
});

/** Tool input used to modify one existing tax document. */
const UPDATE_TAX_DOCUMENT_SCHEMA = z.object({
  taxDocumentId: z.string().min(1).describe("Interní identifikátor dokladu."),
  kind: z
    .enum(["issued", "received"])
    .optional()
    .describe("Volitelná změna typu dokladu."),
  documentNumber: z.string().min(1).optional().describe("Nové číslo dokladu."),
  partnerName: z.string().min(1).optional().describe("Nový název partnera."),
  taxableDate: z
    .string()
    .min(1)
    .optional()
    .describe("Nové DUZP ve formátu `YYYY-MM-DD`."),
  description: z.string().optional().describe("Nová poznámka k dokladu."),
  baseAmount: z
    .number()
    .nonnegative()
    .optional()
    .describe("Nový základ daně v korunách."),
  vatRatePercent: z
    .union([z.literal(21), z.literal(12), z.literal(0)])
    .optional()
    .describe("Nová sazba DPH v procentech."),
});

/** Tool input used to delete one existing document from the current workspace. */
const DELETE_TAX_DOCUMENT_SCHEMA = z.object({
  taxDocumentId: z.string().min(1).describe("Interní identifikátor dokladu."),
});

/**
 * Returns one document enriched with computed VAT and gross totals.
 *
 * @param taxDocument Stored tax document.
 * @returns Document plus derived totals.
 */
function createTaxDocumentWithTotals(
  taxDocument: TaxDocument,
): TaxDocumentWithTotals {
  const documentTotals = calculateDocumentTotals(taxDocument);

  return {
    ...taxDocument,
    vatAmount: documentTotals.vatAmount,
    grossAmount: documentTotals.grossAmount,
  };
}

/**
 * Returns a full workspace snapshot including company profile, documents and summaries.
 *
 * @param taxApplicationState Current mutable application state.
 * @returns Serialized workspace overview for the model.
 */
function createWorkspaceOverview(taxApplicationState: TaxApplicationState) {
  return {
    companyProfile: taxApplicationState.companyProfile,
    taxDocuments: taxApplicationState.taxDocuments.map(createTaxDocumentWithTotals),
    summaries: calculateTaxComputationResult(taxApplicationState.taxDocuments),
  };
}

/**
 * Performs a case-insensitive document search over the current workspace state.
 *
 * @param taxApplicationState Current mutable application state.
 * @param searchTerm Search token provided by the model.
 * @param kind Optional document kind filter.
 * @returns Matching documents enriched with totals.
 */
function searchTaxDocuments(
  taxApplicationState: TaxApplicationState,
  searchTerm: string,
  kind?: TaxDocumentKind,
): TaxDocumentWithTotals[] {
  const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase("cs-CZ");

  return taxApplicationState.taxDocuments
    .filter((taxDocument) => {
      if (kind && taxDocument.kind !== kind) {
        return false;
      }

      return [
        taxDocument.id,
        taxDocument.documentNumber,
        taxDocument.partnerName,
        taxDocument.description,
        taxDocument.taxableDate,
      ].some((value) =>
        value.toLocaleLowerCase("cs-CZ").includes(normalizedSearchTerm),
      );
    })
    .map(createTaxDocumentWithTotals);
}

/**
 * Converts visible chat messages into agent SDK input items.
 *
 * @param messages Stored floating-chat transcript.
 * @returns Conversation history compatible with `run()`.
 */
function createAgentConversationHistory(
  messages: AiAgentChatMessage[],
): AgentInputItem[] {
  return messages.map((message) =>
    message.role === "assistant"
      ? assistant(message.content)
      : user(message.content),
  );
}

/**
 * Reads the mutable agent context from one tool invocation.
 *
 * @param runContext Optional tool run context provided by the SDK.
 * @returns Mutable context object shared across one run.
 */
function getTaxAiAgentContext(
  runContext: { context: TaxAiAgentContext } | undefined,
): TaxAiAgentContext {
  if (!runContext) {
    throw new Error("Kontext AI agenta není k dispozici.");
  }

  return runContext.context;
}

/** Shared tax assistant agent configured with read and write tools. */
const taxAiAgent = new Agent<TaxAiAgentContext>({
  name: "Český daňový agent",
  instructions: TAX_AI_AGENT_SYSTEM_PROMPT,
  model: "gpt-5.4-mini",
  modelSettings: {
    parallelToolCalls: false,
    reasoning: {
      effort: "minimal",
    },
    text: {
      verbosity: "low",
    },
  },
  tools: [
    tool({
      name: "get_workspace_overview",
      description:
        "Vrátí celý aktuální stav aplikace: profil firmy, všechny doklady a vypočtené souhrny.",
      parameters: z.object({}),
      async execute(_input, runContext) {
        return createWorkspaceOverview(
          getTaxAiAgentContext(runContext).taxApplicationState,
        );
      },
    }),
    tool({
      name: "search_tax_documents",
      description:
        "Najde doklady podle čísla, partnera, DUZP, poznámky nebo interního identifikátoru.",
      parameters: SEARCH_TAX_DOCUMENTS_SCHEMA,
      async execute({ kind, searchTerm }, runContext) {
        const taxAiAgentContext = getTaxAiAgentContext(runContext);

        return {
          matches: searchTaxDocuments(
            taxAiAgentContext.taxApplicationState,
            searchTerm,
            kind,
          ),
        };
      },
    }),
    tool({
      name: "add_tax_document",
      description: "Přidá nový daňový doklad do aktuálního stavu aplikace.",
      parameters: ADD_TAX_DOCUMENT_SCHEMA,
      async execute(taxDocumentInput, runContext) {
        const taxAiAgentContext = getTaxAiAgentContext(runContext);

        taxAiAgentContext.taxApplicationState = addTaxDocumentToState(
          taxAiAgentContext.taxApplicationState,
          taxDocumentInput,
        );

        const createdTaxDocument = taxAiAgentContext.taxApplicationState.taxDocuments[0];

        return {
          createdTaxDocument: createTaxDocumentWithTotals(createdTaxDocument),
          summaries: calculateTaxComputationResult(
            taxAiAgentContext.taxApplicationState.taxDocuments,
          ),
        };
      },
    }),
    tool({
      name: "update_tax_document",
      description: "Upraví jeden existující daňový doklad podle interního identifikátoru.",
      parameters: UPDATE_TAX_DOCUMENT_SCHEMA,
      async execute(taxDocumentInput, runContext) {
        const taxAiAgentContext = getTaxAiAgentContext(runContext);
        const currentTaxDocument = findTaxDocumentById(
          taxAiAgentContext.taxApplicationState,
          taxDocumentInput.taxDocumentId,
        );

        if (!currentTaxDocument) {
          return {
            isUpdated: false,
            error: "Doklad s tímto identifikátorem nebyl nalezen.",
          };
        }

        taxAiAgentContext.taxApplicationState = updateTaxDocumentInState(
          taxAiAgentContext.taxApplicationState,
          taxDocumentInput,
        );

        const updatedTaxDocument = findTaxDocumentById(
          taxAiAgentContext.taxApplicationState,
          taxDocumentInput.taxDocumentId,
        );

        return {
          isUpdated: true,
          updatedTaxDocument:
            updatedTaxDocument && createTaxDocumentWithTotals(updatedTaxDocument),
          summaries: calculateTaxComputationResult(
            taxAiAgentContext.taxApplicationState.taxDocuments,
          ),
        };
      },
    }),
    tool({
      name: "delete_tax_document",
      description: "Smaže jeden existující daňový doklad podle interního identifikátoru.",
      parameters: DELETE_TAX_DOCUMENT_SCHEMA,
      async execute({ taxDocumentId }, runContext) {
        const taxAiAgentContext = getTaxAiAgentContext(runContext);
        const currentTaxDocument = findTaxDocumentById(
          taxAiAgentContext.taxApplicationState,
          taxDocumentId,
        );

        if (!currentTaxDocument) {
          return {
            isDeleted: false,
            error: "Doklad s tímto identifikátorem nebyl nalezen.",
          };
        }

        taxAiAgentContext.taxApplicationState = deleteTaxDocumentFromState(
          taxAiAgentContext.taxApplicationState,
          taxDocumentId,
        );

        return {
          isDeleted: true,
          deletedTaxDocument: createTaxDocumentWithTotals(currentTaxDocument),
          summaries: calculateTaxComputationResult(
            taxAiAgentContext.taxApplicationState.taxDocuments,
          ),
        };
      },
    }),
  ],
});

/**
 * Executes one floating-chat turn against the OpenAI Agents SDK.
 *
 * @param taxApplicationState Current normalized application state from the browser.
 * @param messages Previously visible chat transcript.
 * @param userMessage Fresh user input for the new turn.
 * @returns Assistant reply and optionally an updated application state.
 */
export async function runTaxAiAgent(
  taxApplicationState: TaxApplicationState,
  messages: AiAgentChatMessage[],
  userMessage: string,
): Promise<AiAgentResponseBody> {
  const result = await run(
    taxAiAgent,
    [
      ...createAgentConversationHistory(messages),
      user(createTaxAiAgentUserPrompt(userMessage)),
    ],
    {
      context: {
        taxApplicationState,
      },
      maxTurns: 12,
    },
  );
  const nextTaxApplicationState = result.runContext.context.taxApplicationState;
  const hasTaxApplicationStateChanged =
    JSON.stringify(taxApplicationState) !== JSON.stringify(nextTaxApplicationState);

  return {
    assistantMessage:
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : "Promiňte, odpověď se nepodařilo zpracovat.",
    nextTaxApplicationState: hasTaxApplicationStateChanged
      ? nextTaxApplicationState
      : undefined,
    storageStatusMessage: hasTaxApplicationStateChanged
      ? "AI agent aktualizoval lokální data a změna byla uložena."
      : undefined,
  };
}
