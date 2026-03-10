import type { TicketResult } from "@/lib/types";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "google/gemini-3-flash-preview";

interface OpenRouterExtractionInput {
  query: string;
  finalAnswer: string;
  selectedUrl: string;
  fallbackPlatform: string;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function contentToJson(content: unknown): unknown {
  if (typeof content === "string") {
    return parseJson(content);
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => {
        if (
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("");

    return textParts ? parseJson(textParts) : null;
  }

  return content;
}

function normalizeTicket(
  value: unknown,
  fallbackPlatform: string,
  fallbackUrl: string,
): TicketResult | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  return {
    eventName: getString(record.eventName) || "Unknown",
    eventDate: getString(record.eventDate) || "Unknown",
    venue: getString(record.venue) || "Unknown",
    city: getString(record.city) || "Unknown",
    ticketType: getString(record.ticketType) || "Standard",
    section: getString(record.section) || "Unknown",
    row: normalizeNA(getString(record.row)),
    seats: normalizeNA(getString(record.seats)),
    quantity: getString(record.quantity) || "Unknown",
    price: getString(record.price) || "Unknown",
    currency: getString(record.currency) || "USD",
    platform: getString(record.platform) || fallbackPlatform,
    url: getString(record.url) || fallbackUrl,
    notes: getString(record.notes),
  };
}

function normalizeNA(value: string): string {
  const lower = value.toLowerCase().trim();
  if (!lower || lower === "n/a" || lower === "na" || lower === "none") {
    return "Unknown";
  }

  return value;
}

function parseTicketsFromOpenRouterContent(
  content: unknown,
  fallbackPlatform: string,
  fallbackUrl: string,
): TicketResult[] {
  const parsed = contentToJson(content);
  const root = toRecord(parsed);
  if (!root || !Array.isArray(root.tickets)) {
    return [];
  }

  return root.tickets
    .map((item) => normalizeTicket(item, fallbackPlatform, fallbackUrl))
    .filter((item): item is TicketResult => item !== null);
}

export async function extractTicketsWithOpenRouter(
  input: OpenRouterExtractionInput,
): Promise<TicketResult[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY.");
  }

  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
  const { query, finalAnswer, selectedUrl, fallbackPlatform } = input;

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: [
            "Extract ticket listings from the provided summary.",
            "Return JSON ONLY and follow the schema exactly.",
            "Use \"Unknown\" (not \"n/a\" or empty string) for any field you cannot determine.",
            "ticketType should be one of: \"Standard\", \"Resale\", \"VIP\", \"Package\", \"GA\", \"Premium\", \"Other\".",
            "currency should be a 3-letter ISO code (USD, EUR, GBP, etc.).",
            "section should reflect the source label exactly (e.g., \"VIP1\", \"Section 102\", \"Floor\").",
            "price should include the currency symbol as shown on the page.",
            "If the event is package-based (no specific seats), set row and seats to \"Unknown\".",
            "Do not invent fields that are not in the schema.",
            "If no ticket listings are found, return {\"tickets\":[]}.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `User query: ${query}`,
            `Selected URL: ${selectedUrl || "N/A"}`,
            "Raw agent summary:",
            finalAnswer,
          ].join("\n\n"),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ticket_results",
          strict: true,
          schema: {
            type: "object",
            properties: {
              tickets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    eventName: { type: "string" },
                    eventDate: { type: "string" },
                    venue: { type: "string" },
                    city: { type: "string" },
                    ticketType: { type: "string" },
                    section: { type: "string" },
                    row: { type: "string" },
                    seats: { type: "string" },
                    quantity: { type: "string" },
                    price: { type: "string" },
                    currency: { type: "string" },
                    platform: { type: "string" },
                    url: { type: "string" },
                    notes: { type: "string" },
                  },
                  required: [
                    "eventName",
                    "eventDate",
                    "venue",
                    "city",
                    "ticketType",
                    "section",
                    "row",
                    "seats",
                    "quantity",
                    "price",
                    "currency",
                    "platform",
                    "url",
                    "notes",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["tickets"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(
      `OpenRouter request failed (${response.status}): ${rawText.slice(0, 400)}`,
    );
  }

  const parsedResponse = parseJson(rawText);
  const root = toRecord(parsedResponse);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const firstChoice = choices[0];
  const firstChoiceRecord = toRecord(firstChoice);
  const message = toRecord(firstChoiceRecord?.message);
  const content = message?.content;

  const tickets = parseTicketsFromOpenRouterContent(
    content,
    fallbackPlatform,
    selectedUrl,
  );

  return tickets;
}
