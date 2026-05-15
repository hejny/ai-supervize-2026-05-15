"use client";

import { useState } from "react";
import type {
  TaxAssistantConversationMessage,
  TaxAssistantResponse,
} from "@/lib/ai-tax-assistant-contract";
import type { TaxApplicationState } from "@/lib/tax-calculations";

/** Suggested starter prompts for the in-app assistant. */
const AI_ASSISTANT_SUGGESTIONS = [
  "Shrn mi aktualni DPH bilanci.",
  "Na co si mam dat pozor v techto dokladech?",
  "Jak se z techto dat pocita dan z prijmu?",
] as const;

/** Props accepted by the AI assistant panel. */
interface AiTaxAssistantPanelProps {
  taxApplicationState: TaxApplicationState;
}

/**
 * Returns bubble styles for a single chat message.
 *
 * @param role Chat speaker role.
 * @returns Tailwind class list for the chat bubble.
 */
function getMessageBubbleClassName(
  role: TaxAssistantConversationMessage["role"],
): string {
  return role === "user"
    ? "ml-auto border-slate-950 bg-slate-950 text-white"
    : "mr-auto border-slate-200 bg-slate-50 text-slate-900";
}

/**
 * Renders the AI assistant panel that can answer questions about the current tax data.
 *
 * @param props Component props.
 * @returns Interactive assistant UI.
 */
export default function AiTaxAssistantPanel({
  taxApplicationState,
}: AiTaxAssistantPanelProps) {
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState<
    TaxAssistantConversationMessage[]
  >([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAskAssistant() {
    const normalizedQuestion = question.trim();

    if (!normalizedQuestion || isSubmitting) {
      return;
    }

    const nextConversation = [
      ...conversation,
      {
        role: "user" as const,
        content: normalizedQuestion,
      },
    ];

    setConversation(nextConversation);
    setQuestion("");
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/ai-tax-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: normalizedQuestion,
          conversation,
          taxApplicationState,
        }),
      });
      const responseBody = (await response.json()) as
        | TaxAssistantResponse
        | { error?: string };

      if (!response.ok || !("answer" in responseBody)) {
        throw new Error(
          "error" in responseBody && typeof responseBody.error === "string"
            ? responseBody.error
            : "AI asistent nevratil odpoved.",
        );
      }

      setConversation((currentConversation) => [
        ...currentConversation,
        {
          role: "assistant",
          content: responseBody.answer,
        },
      ]);
    } catch (error) {
      const nextErrorMessage =
        error instanceof Error
          ? error.message
          : "AI asistent narazil na neocekavanou chybu.";

      setErrorMessage(nextErrorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            AI asistent nad vasimi daty
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Asistent odpovida nad aktualnim profilem firmy, zadanými doklady a
            vypoctenymi souhrny. Pri odeslani dotazu se tento obsah posle na
            server a zpracuje pres OpenAI Agents SDK.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Informativni pomoc, ne oficialni danove poradenstvi.
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {AI_ASSISTANT_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setQuestion(suggestion)}
            className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex max-h-96 min-h-48 flex-col gap-3 overflow-y-auto">
          {conversation.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm leading-6 text-slate-500">
              Zeptejte se na DPH bilanci, dan z prijmu, chybejici udaje nebo na
              to, jak se aktualni hodnoty pocitaji.
            </div>
          ) : (
            conversation.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`max-w-3xl rounded-2xl border px-4 py-3 text-sm leading-6 ${getMessageBubbleClassName(
                  message.role,
                )}`}
              >
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">
                  {message.role === "user" ? "Vy" : "AI asistent"}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </article>
            ))
          )}

          {isSubmitting && (
            <div className="mr-auto rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              AI asistent pripravuji odpoved…
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">
              Dotaz pro asistenta
            </span>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
              placeholder="Napriklad: Proc mi vysla tato DPH bilance a ktere doklady ji ovlivnuji nejvice?"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleAskAssistant()}
              disabled={!question.trim() || isSubmitting}
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? "Odesilam dotaz…" : "Zeptat se AI"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

