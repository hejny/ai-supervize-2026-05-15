"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTaxApplicationState } from "@/app/_components/tax-application-state-provider";
import type {
  AiAgentChatMessage,
  AiAgentResponseBody,
} from "@/lib/ai-agent/contracts";

/** Creates a stable client-side chat message identifier. */
function createChatMessageId(): string {
  return `chat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

/** Returns one new visible floating-chat message. */
function createChatMessage(
  role: AiAgentChatMessage["role"],
  content: string,
): AiAgentChatMessage {
  return {
    id: createChatMessageId(),
    role,
    content,
  };
}

/**
 * Global floating AI tax agent available from any page in the app.
 *
 * @returns Floating bubble and expandable chat panel.
 */
export default function FloatingAiAgent() {
  const {
    isStorageReady,
    replaceTaxApplicationState,
    taxApplicationState,
  } = useTaxApplicationState();
  const [isOpen, setIsOpen] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messages, setMessages] = useState<AiAgentChatMessage[]>([
    createChatMessage(
      "assistant",
      "Dobrý den, jsem AI daňový agent. Mohu odpovídat nad profilem firmy, doklady i souhrny a podle instrukcí upravovat doklady.",
    ),
  ]);
  const messagesEndReference = useRef<HTMLDivElement | null>(null);

  const isSendDisabled = useMemo(
    () => !isStorageReady || isSubmitting || !draftMessage.trim(),
    [draftMessage, isStorageReady, isSubmitting],
  );

  useEffect(() => {
    messagesEndReference.current?.scrollIntoView({ behavior: "smooth" });
  }, [isOpen, messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedDraftMessage = draftMessage.trim();

    if (!trimmedDraftMessage) {
      return;
    }

    const nextUserMessage = createChatMessage("user", trimmedDraftMessage);
    const previousMessages = messages;

    setMessages((currentMessages) => [...currentMessages, nextUserMessage]);
    setDraftMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/ai-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: previousMessages,
          userMessage: trimmedDraftMessage,
          taxApplicationState,
        }),
      });
      const responseBody = (await response.json()) as AiAgentResponseBody;

      setMessages((currentMessages) => [
        ...currentMessages,
        createChatMessage("assistant", responseBody.assistantMessage),
      ]);

      if (responseBody.nextTaxApplicationState) {
        replaceTaxApplicationState(
          responseBody.nextTaxApplicationState,
          responseBody.storageStatusMessage,
        );
      }
    } catch {
      setMessages((currentMessages) => [
        ...currentMessages,
        createChatMessage(
          "assistant",
          "AI daňový agent právě není dostupný. Zkuste to prosím za chvíli znovu.",
        ),
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {isOpen && (
        <section
          id="floating-ai-agent-panel"
          role="dialog"
          aria-label="AI daňový agent"
          className="pointer-events-auto flex h-[min(38rem,calc(100vh-7rem))] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        >
          <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-300">OpenAI Agents SDK</p>
                <h2 className="mt-1 text-lg font-semibold">AI daňový agent</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-white/15 px-3 py-1 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Zavřít
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Ptejte se na firemní profil, doklady nebo souhrny. Mohu také přidat,
              upravit a smazat doklad podle vašeho zadání.
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-4 py-4">
            {messages.map((message) => (
              <article
                key={message.id}
                className={[
                  "max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
                  message.role === "assistant"
                    ? "mr-auto bg-white text-slate-800"
                    : "ml-auto bg-slate-950 text-white",
                ].join(" ")}
              >
                <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
                  {message.role === "assistant" ? "AI agent" : "Vy"}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </article>
            ))}
            {isSubmitting && (
              <article className="mr-auto max-w-[90%] rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                AI daňový agent přemýšlí…
              </article>
            )}
            <div ref={messagesEndReference} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Zpráva pro AI agenta
              </span>
              <textarea
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                placeholder="Například: Shrň mi aktuální DPH bilanci nebo smaž doklad 2026-001."
              />
            </label>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs leading-5 text-slate-500">
                Agent odpovídá pouze česky s diakritikou.
              </p>
              <button
                type="submit"
                disabled={isSendDisabled}
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Odeslat
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((currentIsOpen) => !currentIsOpen)}
        className="pointer-events-auto inline-flex items-center gap-3 rounded-full bg-slate-950 px-5 py-4 text-sm font-semibold text-white shadow-xl transition hover:bg-slate-800"
        aria-expanded={isOpen}
        aria-controls="floating-ai-agent-panel"
        aria-label={isOpen ? "Zavřít AI daňového agenta" : "Otevřít AI daňového agenta"}
      >
        <span className="inline-flex h-3 w-3 rounded-full bg-emerald-400" />
        AI agent
      </button>
    </div>
  );
}
