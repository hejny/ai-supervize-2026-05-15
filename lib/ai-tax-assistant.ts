import { Agent, run } from "@openai/agents";
import type {
  TaxAssistantConversationMessage,
  TaxAssistantRequest,
} from "@/lib/ai-tax-assistant-contract";
import type { TaxApplicationState, TaxDocument } from "@/lib/tax-calculations";
import {
  calculateDocumentTotals,
  calculateTaxComputationResult,
  normalizeTaxApplicationState,
  roundCurrency,
} from "@/lib/tax-calculations";

/** OpenAI model used by the in-app tax assistant. */
const TAX_ASSISTANT_MODEL = "gpt-4.1";

/** Shared AI assistant configured with the OpenAI Agents SDK. */
const taxAssistantAgent = new Agent({
  name: "Czech Tax Assistant",
  model: TAX_ASSISTANT_MODEL,
  instructions: [
    "Jsi uzitecny AI asistent pro tento MVP prehled ceskych danovych dokladu.",
    "Odpovidej cesky a bud vecny, srozumitelny a prakticky.",
    "Zakladej se primarne na poskytnutem stavu firmy, dokladech a vypoctenych souhrnech.",
    "Nevymyslej si chybejici cisla ani fakta. Kdyz neco chybi, pojmenuj to explicitne.",
    "Upozorni, kdyz je dotaz mimo scope tohoto MVP nebo kdyz jde o orientacni odpoved, nikoli oficialni danove poradenstvi.",
    "Nepredstirej, ze aplikace umi oficialni podani nebo pokryva slozite ucetni a danove scenare, pokud to z podkladu neplyne.",
    "Pouzij kratke odstavce nebo kratky seznam jen kdyz to zvysi srozumitelnost.",
  ].join(" "),
});

/**
 * Formats a currency amount for prompt context.
 *
 * @param amount Numeric amount in CZK.
 * @returns Rounded string representation in CZK.
 */
function formatPromptCurrency(amount: number): string {
  return `${roundCurrency(amount).toFixed(2)} CZK`;
}

/**
 * Formats one entered tax document for the agent prompt.
 *
 * @param taxDocument Entered tax document.
 * @returns Human-readable document line.
 */
function formatTaxDocumentForPrompt(taxDocument: TaxDocument): string {
  const documentTotals = calculateDocumentTotals(taxDocument);

  return [
    `- ${taxDocument.kind === "issued" ? "Vydany" : "Prijaty"} doklad`,
    `cislo ${taxDocument.documentNumber}`,
    `partner ${taxDocument.partnerName}`,
    `DUZP ${taxDocument.taxableDate || "neuvedeno"}`,
    `zaklad ${formatPromptCurrency(taxDocument.baseAmount)}`,
    `DPH ${taxDocument.vatRatePercent} %`,
    `castka DPH ${formatPromptCurrency(documentTotals.vatAmount)}`,
    `celkem ${formatPromptCurrency(documentTotals.grossAmount)}`,
    `poznamka ${taxDocument.description || "bez poznamky"}`,
  ].join(", ");
}

/**
 * Formats prior chat messages into a compact conversation transcript.
 *
 * @param conversation Previous client-side conversation.
 * @returns Normalized transcript for the prompt.
 */
function formatConversationForPrompt(
  conversation: TaxAssistantConversationMessage[],
): string {
  if (conversation.length === 0) {
    return "Zadna predchozi konverzace.";
  }

  return conversation
    .map((message) => {
      const speakerLabel =
        message.role === "user" ? "Uzivatel" : "Asistent";

      return `${speakerLabel}: ${message.content}`;
    })
    .join("\n");
}

/**
 * Builds the contextual prompt passed into the OpenAI agent run.
 *
 * @param question Current user question.
 * @param conversation Previous conversation history.
 * @param taxApplicationState Current normalized workspace state.
 * @returns Full prompt with workspace context.
 */
function buildTaxAssistantPrompt(
  question: string,
  conversation: TaxAssistantConversationMessage[],
  taxApplicationState: TaxApplicationState,
): string {
  const taxComputationResult = calculateTaxComputationResult(
    taxApplicationState.taxDocuments,
  );
  const documentLines =
    taxApplicationState.taxDocuments.length === 0
      ? "- Zadne doklady zatim nebyly zadany."
      : taxApplicationState.taxDocuments
          .map((taxDocument) => formatTaxDocumentForPrompt(taxDocument))
          .join("\n");

  return [
    "Mas pomoci uzivateli s orientaci v tomto MVP dashboardu.",
    "",
    "## Omezeni MVP",
    "- Pocita jen bezne tuzemske scenare.",
    "- Nepokryva slozite ucetni a danove pripady, ztraty, specialni odpocty ani oficialni podani.",
    "- Odpoved ma byt informativni a ma vychazet z dat nize.",
    "",
    "## Profil firmy",
    `- Nazev: ${taxApplicationState.companyProfile.companyName || "neuvedeno"}`,
    `- ICO: ${taxApplicationState.companyProfile.companyRegistrationNumber || "neuvedeno"}`,
    `- DIC: ${taxApplicationState.companyProfile.taxIdentificationNumber || "neuvedeno"}`,
    `- Zdanovaci rok: ${taxApplicationState.companyProfile.taxYear || "neuvedeno"}`,
    `- Perioda DPH: ${taxApplicationState.companyProfile.vatPeriod === "quarterly" ? "ctvrtletni" : "mesicni"}`,
    "",
    "## Souhrn vypoctu",
    `- Pocet vydanych dokladu: ${taxComputationResult.issuedDocumentsCount}`,
    `- Pocet prijatych dokladu: ${taxComputationResult.receivedDocumentsCount}`,
    `- Zdanitelna plneni na vystupu: ${formatPromptCurrency(taxComputationResult.vatSummary.taxableSuppliesAmount)}`,
    `- Prijata plneni pro odpocet: ${formatPromptCurrency(taxComputationResult.vatSummary.deductiblePurchasesAmount)}`,
    `- DPH na vystupu: ${formatPromptCurrency(taxComputationResult.vatSummary.outputVatAmount)}`,
    `- DPH na vstupu: ${formatPromptCurrency(taxComputationResult.vatSummary.inputVatAmount)}`,
    `- Bilance DPH: ${formatPromptCurrency(taxComputationResult.vatSummary.vatBalanceAmount)}`,
    `- Vynosy: ${formatPromptCurrency(taxComputationResult.corporateIncomeTaxSummary.revenueAmount)}`,
    `- Naklady: ${formatPromptCurrency(taxComputationResult.corporateIncomeTaxSummary.expenseAmount)}`,
    `- Hospodarsky vysledek: ${formatPromptCurrency(taxComputationResult.corporateIncomeTaxSummary.profitBeforeTaxAmount)}`,
    `- Danovy zaklad: ${formatPromptCurrency(taxComputationResult.corporateIncomeTaxSummary.taxBaseAmount)}`,
    `- Dan z prijmu pravnickych osob: ${formatPromptCurrency(taxComputationResult.corporateIncomeTaxSummary.corporateIncomeTaxAmount)}`,
    "",
    "## Doklady",
    documentLines,
    "",
    "## Predchozi konverzace",
    formatConversationForPrompt(conversation),
    "",
    "## Aktualni dotaz uzivatele",
    question,
  ].join("\n");
}

/**
 * Sanitizes the client-provided conversation history.
 *
 * @param conversation Unknown conversation payload.
 * @returns Safe conversation array for the prompt.
 */
function normalizeConversation(
  conversation: unknown,
): TaxAssistantConversationMessage[] {
  if (!Array.isArray(conversation)) {
    return [];
  }

  return conversation.flatMap((message) => {
    if (!message || typeof message !== "object") {
      return [];
    }

    const candidateMessage = message as Partial<TaxAssistantConversationMessage>;

    if (
      (candidateMessage.role !== "user" &&
        candidateMessage.role !== "assistant") ||
      typeof candidateMessage.content !== "string"
    ) {
      return [];
    }

    const normalizedContent = candidateMessage.content.trim();

    if (!normalizedContent) {
      return [];
    }

    return [
      {
        role: candidateMessage.role,
        content: normalizedContent,
      },
    ];
  });
}

/**
 * Validates and normalizes the raw API request body.
 *
 * @param requestBody Unknown JSON body received by the route.
 * @returns Normalized request ready for the agent run.
 */
export function normalizeTaxAssistantRequest(
  requestBody: unknown,
): TaxAssistantRequest {
  if (!requestBody || typeof requestBody !== "object") {
    return {
      question: "",
      conversation: [],
      taxApplicationState: normalizeTaxApplicationState(undefined),
    };
  }

  const candidateRequestBody = requestBody as Partial<TaxAssistantRequest>;

  return {
    question:
      typeof candidateRequestBody.question === "string"
        ? candidateRequestBody.question.trim()
        : "",
    conversation: normalizeConversation(candidateRequestBody.conversation),
    taxApplicationState: normalizeTaxApplicationState(
      candidateRequestBody.taxApplicationState,
    ),
  };
}

/**
 * Runs the OpenAI assistant with the current workspace context.
 *
 * @param request Normalized assistant request body.
 * @returns Assistant answer ready for the UI.
 */
export async function generateTaxAssistantAnswer(
  request: TaxAssistantRequest,
): Promise<string> {
  const result = await run(
    taxAssistantAgent,
    buildTaxAssistantPrompt(
      request.question,
      request.conversation,
      request.taxApplicationState,
    ),
  );
  const finalOutput = result.finalOutput;

  if (typeof finalOutput !== "string") {
    throw new Error("AI assistant returned an unexpected output type.");
  }

  return finalOutput.trim();
}

