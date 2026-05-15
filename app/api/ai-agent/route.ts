import { z } from "zod";
import { normalizeTaxApplicationState } from "@/lib/tax-calculations";
import { runTaxAiAgent } from "@/lib/ai-agent/agent";
import type { AiAgentRequestBody, AiAgentResponseBody } from "@/lib/ai-agent/contracts";

/** Forces the route handler to run in a Node.js environment for the OpenAI SDK. */
export const runtime = "nodejs";

/** Request schema for one floating AI chat turn. */
const AI_AGENT_REQUEST_SCHEMA = z.object({
  messages: z.array(
    z.object({
      id: z.string().min(1),
      role: z.union([z.literal("user"), z.literal("assistant")]),
      content: z.string(),
    }),
  ),
  userMessage: z.string().min(1),
  taxApplicationState: z.unknown(),
});

/**
 * Handles one AI chat turn over the current local workspace data.
 *
 * @param request Incoming POST request from the floating AI widget.
 * @returns Assistant reply and optionally the updated workspace state.
 */
export async function POST(request: Request): Promise<Response> {
  const requestBody = (await request.json()) as AiAgentRequestBody;
  const parsingResult = AI_AGENT_REQUEST_SCHEMA.safeParse(requestBody);

  if (!parsingResult.success) {
    return Response.json(
      {
        assistantMessage:
          "Požadavek pro AI agenta nebyl platný. Zkuste to prosím znovu.",
      } satisfies AiAgentResponseBody,
      { status: 400 },
    );
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json({
      assistantMessage:
        "AI daňový agent není dostupný, protože na serveru chybí proměnná `OPENAI_API_KEY`.",
    } satisfies AiAgentResponseBody);
  }

  try {
    const normalizedTaxApplicationState = normalizeTaxApplicationState(
      parsingResult.data.taxApplicationState,
    );

    const responseBody = await runTaxAiAgent(
      normalizedTaxApplicationState,
      parsingResult.data.messages,
      parsingResult.data.userMessage,
    );

    return Response.json(responseBody satisfies AiAgentResponseBody);
  } catch {
    return Response.json(
      {
        assistantMessage:
          "AI daňový agent narazil na chybu při zpracování požadavku. Zkuste to prosím znovu.",
      } satisfies AiAgentResponseBody,
      { status: 500 },
    );
  }
}
