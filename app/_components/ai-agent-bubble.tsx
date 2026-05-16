"use client";

import { useState, type FormEvent } from "react";
import type { TaxApplicationState } from "@/lib/tax-calculations";
import {
  DEFAULT_TAX_APPLICATION_STATE,
  normalizeTaxApplicationState,
} from "@/lib/tax-calculations";
import {
  TAX_APPLICATION_LOCAL_STORAGE_KEY,
  dispatchTaxApplicationStateReplacedEvent,
} from "@/lib/tax-application-storage";

/** Maximum number of prior messages sent to the server for context. */
const MAX_CLIENT_CHAT_HISTORY_MESSAGES = 10;

/** Message shown when the API returns an unexpected shape. */
const UNEXPECTED_AI_AGENT_RESPONSE_MESSAGE =
  "AI asistent vrátil neočekávanou odpověď. Zkuste požadavek zopakovat.";

/** Message shown when the API request itself fails. */
const FAILED_AI_AGENT_REQUEST_MESSAGE =
  "AI asistenta se nepodařilo kontaktovat. Zkuste to prosím znovu.";

/** Initial Czech assistant greeting. */
const INITIAL_AI_AGENT_MESSAGE =
  "Dobrý den, můžu pracovat s aktuálními doklady, profilem firmy a vypočtenými souhrny.";

/** One chat message rendered in the floating bubble. */
interface AiAgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** JSON response expected from the tax agent route. */
interface AiAgentChatResponse {
  assistantMessage?: unknown;
  taxApplicationState?: unknown;
  isTaxApplicationStateChanged?: unknown;
  appliedChangeMessages?: unknown;
  errorMessage?: unknown;
}

/**
 * Reads the latest persisted tax workspace from browser storage.
 *
 * @returns Normalized current tax application state.
 */
function readStoredTaxApplicationState(): TaxApplicationState {
  try {
    const storedTaxApplicationState = window.localStorage.getItem(
      TAX_APPLICATION_LOCAL_STORAGE_KEY,
    );

    if (!storedTaxApplicationState) {
      return DEFAULT_TAX_APPLICATION_STATE;
    }

    return normalizeTaxApplicationState(JSON.parse(storedTaxApplicationState));
  } catch {
    window.localStorage.removeItem(TAX_APPLICATION_LOCAL_STORAGE_KEY);

    return DEFAULT_TAX_APPLICATION_STATE;
  }
}

/**
 * Returns the visible assistant message from a route response.
 *
 * @param responseBody Parsed JSON response body.
 * @returns Assistant message to append to the conversation.
 */
function getAssistantMessage(responseBody: AiAgentChatResponse): string {
  if (
    typeof responseBody.assistantMessage === "string" &&
    responseBody.assistantMessage.trim()
  ) {
    return responseBody.assistantMessage.trim();
  }

  if (
    typeof responseBody.errorMessage === "string" &&
    responseBody.errorMessage.trim()
  ) {
    return responseBody.errorMessage.trim();
  }

  return UNEXPECTED_AI_AGENT_RESPONSE_MESSAGE;
}

/**
 * Creates the local storage status message after an agent mutation.
 *
 * @param responseBody Parsed JSON response body.
 * @returns Status message for the main workspace.
 */
function createAgentStorageStatusMessage(
  responseBody: AiAgentChatResponse,
): string {
  if (Array.isArray(responseBody.appliedChangeMessages)) {
    const firstAppliedChangeMessage = responseBody.appliedChangeMessages.find(
      (message): message is string => typeof message === "string",
    );

    if (firstAppliedChangeMessage) {
      return `AI asistent: ${firstAppliedChangeMessage}`;
    }
  }

  return "AI asistent aktualizoval doklady a souhrny.";
}

/**
 * Stores a complete workspace replacement and notifies active client components.
 *
 * @param taxApplicationState Replacement tax application state.
 * @param statusMessage User-facing status message for the main page.
 */
function replaceStoredTaxApplicationState(
  taxApplicationState: TaxApplicationState,
  statusMessage: string,
): void {
  window.localStorage.setItem(
    TAX_APPLICATION_LOCAL_STORAGE_KEY,
    JSON.stringify(taxApplicationState),
  );
  dispatchTaxApplicationStateReplacedEvent({
    taxApplicationState,
    statusMessage,
  });
}

/**
 * Floating AI assistant available across application pages.
 *
 * @returns Chat bubble and expandable assistant panel.
 */
export default function AiAgentBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [isRequestPending, setIsRequestPending] = useState(false);
  const [aiUserInput, setAiUserInput] = useState("");
  const [chatMessages, setChatMessages] = useState<AiAgentChatMessage[]>([
    {
      role: "assistant",
      content: INITIAL_AI_AGENT_MESSAGE,
    },
  ]);

  /**
   * Sends one chat turn to the server-side AI agent.
   *
   * @param event Chat form submit event.
   */
  async function handleSendAiMessage(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const trimmedAiUserInput = aiUserInput.trim();

    if (!trimmedAiUserInput || isRequestPending) {
      return;
    }

    const userChatMessage: AiAgentChatMessage = {
      role: "user",
      content: trimmedAiUserInput,
    };
    const nextChatMessages = [...chatMessages, userChatMessage];

    setChatMessages(nextChatMessages);
    setAiUserInput("");
    setIsRequestPending(true);

    try {
      const response = await fetch("/api/tax-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmedAiUserInput,
          taxApplicationState: readStoredTaxApplicationState(),
          chatMessages: nextChatMessages.slice(-MAX_CLIENT_CHAT_HISTORY_MESSAGES),
        }),
      });
      const responseBody = (await response
        .json()
        .catch(() => ({}))) as AiAgentChatResponse;
      const assistantMessage = getAssistantMessage(responseBody);

      if (
        response.ok &&
        responseBody.isTaxApplicationStateChanged === true &&
        responseBody.taxApplicationState
      ) {
        const normalizedTaxApplicationState = normalizeTaxApplicationState(
          responseBody.taxApplicationState,
        );

        replaceStoredTaxApplicationState(
          normalizedTaxApplicationState,
          createAgentStorageStatusMessage(responseBody),
        );
      }

      setChatMessages((currentChatMessages) => [
        ...currentChatMessages,
        {
          role: "assistant",
          content: assistantMessage,
        },
      ]);
    } catch {
      setChatMessages((currentChatMessages) => [
        ...currentChatMessages,
        {
          role: "assistant",
          content: FAILED_AI_AGENT_REQUEST_MESSAGE,
        },
      ]);
    } finally {
      setIsRequestPending(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3">
      {isOpen && (
        <aside
          aria-label="AI asistent"
          className="flex h-[min(34rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
            <div>
              <h2 className="text-base font-semibold">AI asistent</h2>
              <p className="mt-1 text-xs leading-5 text-slate-300">
                Pracuje s lokálními daty aplikace.
              </p>
            </div>
            <button
              type="button"
              aria-label="Zavřít AI asistenta"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/10"
            >
              Zavřít
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
            {chatMessages.map((chatMessage, chatMessageIndex) => (
              <article
                key={`${chatMessage.role}-${chatMessageIndex}`}
                className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                  chatMessage.role === "user"
                    ? "ml-8 bg-cyan-700 text-white"
                    : "mr-8 border border-slate-200 bg-white text-slate-800"
                }`}
              >
                {chatMessage.content}
              </article>
            ))}

            {isRequestPending && (
              <div className="mr-8 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                Připravuji odpověď…
              </div>
            )}
          </div>

          <form
            onSubmit={handleSendAiMessage}
            className="border-t border-slate-200 bg-white p-4"
          >
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Zpráva pro AI asistenta
              </span>
              <textarea
                value={aiUserInput}
                onChange={(event) => setAiUserInput(event.target.value)}
                rows={3}
                className="max-h-32 min-h-20 w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-cyan-600"
                placeholder="Např. přidej vydaný doklad 2026-010..."
              />
            </label>

            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={!aiUserInput.trim() || isRequestPending}
                className="rounded-full bg-cyan-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Odeslat zprávu
              </button>
            </div>
          </form>
        </aside>
      )}

      <button
        type="button"
        aria-label="Otevřít AI asistenta"
        onClick={() => setIsOpen((currentIsOpen) => !currentIsOpen)}
        className="h-14 w-14 rounded-full bg-cyan-700 text-sm font-semibold text-white shadow-xl ring-4 ring-white transition hover:bg-cyan-800"
      >
        AI
      </button>
    </div>
  );
}
