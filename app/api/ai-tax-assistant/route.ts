import type { TaxAssistantResponse } from "@/lib/ai-tax-assistant-contract";
import {
  generateTaxAssistantAnswer,
  normalizeTaxAssistantRequest,
} from "@/lib/ai-tax-assistant";

/** Forces the AI route onto the Node.js runtime required by the SDK. */
export const runtime = "nodejs";

/**
 * Handles AI assistant requests for the tax dashboard.
 *
 * @param request Incoming route request.
 * @returns JSON response with the assistant answer or an error description.
 */
export async function POST(request: Request): Promise<Response> {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      {
        error:
          "AI asistent neni dostupny, protoze na serveru chybi promenna `OPENAI_API_KEY`.",
      },
      { status: 503 },
    );
  }

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return Response.json(
      { error: "Pozadavek AI asistenta musi byt validni JSON." },
      { status: 400 },
    );
  }

  const normalizedRequest = normalizeTaxAssistantRequest(requestBody);

  if (!normalizedRequest.question) {
    return Response.json(
      { error: "Nejprve zadejte dotaz pro AI asistenta." },
      { status: 400 },
    );
  }

  try {
    const answer = await generateTaxAssistantAnswer(normalizedRequest);
    const responseBody: TaxAssistantResponse = { answer };

    return Response.json(responseBody);
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "AI asistent nemohl odpoved vygenerovat.";

    return Response.json(
      {
        error: `AI asistent narazil na chybu: ${errorMessage}`,
      },
      { status: 500 },
    );
  }
}

