import { bdclient } from "@brightdata/sdk";
import type { SerpResult } from "@/lib/types";

const PLATFORM_RULES = [
  { platform: "Ticketmaster", domains: ["ticketmaster.com"] },
  { platform: "StubHub", domains: ["stubhub.com"] },
  { platform: "SeatGeek", domains: ["seatgeek.com"] },
  { platform: "Vivid Seats", domains: ["vividseats.com"] },
  { platform: "AXS", domains: ["axs.com"] },
  { platform: "Eventbrite", domains: ["eventbrite.com"] },
  { platform: "TickPick", domains: ["tickpick.com"] },
  { platform: "Gametime", domains: ["gametime.co"] },
  { platform: "Viagogo", domains: ["viagogo.com"] },
  { platform: "TicketNetwork", domains: ["ticketnetwork.com"] },
  { platform: "Tickets.com", domains: ["tickets.com"] },
] as const;

const DEFAULT_WEB_UNLOCKER_ZONE = "unblocker";
const DEFAULT_SERP_ZONE = "serp";
const BRIGHT_DATA_LOG_PREFIX = "[bright-data][serp]";

let brightDataClient: bdclient | null = null;

function getBrightDataClient(): bdclient {
  if (brightDataClient) {
    return brightDataClient;
  }

  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    throw new Error("Missing BRIGHTDATA_API_KEY.");
  }

  brightDataClient = new bdclient({
    apiKey,
    webUnlockerZone:
      process.env.BRIGHTDATA_WEB_UNLOCKER_ZONE ?? DEFAULT_WEB_UNLOCKER_ZONE,
    serpZone: process.env.BRIGHTDATA_SERP_ZONE ?? DEFAULT_SERP_ZONE,
  });
  return brightDataClient;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function unwrapSearchPayload(value: unknown): unknown {
  const record = toRecord(value);
  if (!record) {
    return value;
  }

  if ("body" in record) {
    return parseJson(record.body);
  }

  return value;
}

function getString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function extractCandidateEntries(payload: unknown): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  const queue: unknown[] = [payload];
  const seen = new Set<unknown>();
  const preferredArrayKeys = new Set(["organic", "results", "items"]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    const record = toRecord(current);
    if (!record) {
      continue;
    }

    const link = getString(record, "link") ?? getString(record, "url");
    if (link) {
      candidates.push(record);
    }

    for (const [key, value] of Object.entries(record)) {
      if (Array.isArray(value)) {
        if (preferredArrayKeys.has(key)) {
          for (const item of value) {
            if (toRecord(item)) {
              candidates.push(item as Record<string, unknown>);
            }
          }
        }
        queue.push(value);
      } else if (toRecord(value)) {
        queue.push(value);
      }
    }
  }

  return candidates;
}

function getUrlFromEntry(entry: Record<string, unknown>): string | null {
  const url =
    getString(entry, "link") ??
    getString(entry, "url") ??
    getString(entry, "href");

  if (!url) {
    return null;
  }

  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

function detectPlatform(url: string, title: string): string | null {
  const normalized = `${url} ${title}`.toLowerCase();

  for (const rule of PLATFORM_RULES) {
    if (rule.domains.some((domain) => normalized.includes(domain))) {
      return rule.platform;
    }
  }

  return null;
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 2);
}

function scoreResult(result: SerpResult, queryTokens: string[]): number {
  const normalized = `${result.title} ${result.url}`.toLowerCase();
  let score = 50;

  for (const token of queryTokens) {
    if (normalized.includes(token)) {
      score += 5;
    }
  }

  if (normalized.includes("ticket")) {
    score += 10;
  }
  if (normalized.includes("event")) {
    score += 6;
  }
  if (normalized.includes("/search") || normalized.includes("?q=")) {
    score -= 12;
  }
  if (normalized.includes("/event/") || normalized.includes("/events/")) {
    score += 8;
  }

  return score;
}

function dedupeByUrl(results: SerpResult[]): SerpResult[] {
  const seen = new Set<string>();
  const deduped: SerpResult[] = [];

  for (const result of results) {
    if (seen.has(result.url)) {
      continue;
    }

    seen.add(result.url);
    deduped.push(result);
  }

  return deduped;
}

function stringifyForLog(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildGoogleSerpUrl(query: string): string {
  const encodedQuery = encodeURIComponent(query.trim());
  return `https://www.google.com/search?q=${encodedQuery}&brd_json=1`;
}

export async function searchTickets(query: string): Promise<SerpResult[]> {
  console.log(`${BRIGHT_DATA_LOG_PREFIX} search query: ${query}`);
  const client = getBrightDataClient();
  const searchUrl = buildGoogleSerpUrl(query);
  console.log(`${BRIGHT_DATA_LOG_PREFIX} request url: ${searchUrl}`);

  const response = await client.scrape(searchUrl, {
    format: "json",
  });
  console.log(
    `${BRIGHT_DATA_LOG_PREFIX} raw response:\n${stringifyForLog(response)}`,
  );

  const payload = unwrapSearchPayload(response);
  console.log(
    `${BRIGHT_DATA_LOG_PREFIX} unwrapped payload:\n${stringifyForLog(payload)}`,
  );
  const entries = extractCandidateEntries(payload);
  console.log(
    `${BRIGHT_DATA_LOG_PREFIX} extracted candidate entries: ${entries.length}`,
  );
  const queryTokens = tokenizeQuery(query);

  const filtered = entries
    .map((entry) => {
      const url = getUrlFromEntry(entry);
      if (!url) {
        return null;
      }

      const title =
        getString(entry, "title") ??
        getString(entry, "description") ??
        "Ticket listing";
      const platform = detectPlatform(url, title);

      if (!platform) {
        return null;
      }

      return {
        url,
        title,
        platform,
      } satisfies SerpResult;
    })
    .filter((value): value is SerpResult => value !== null);
  console.log(
    `${BRIGHT_DATA_LOG_PREFIX} platform-matched entries:\n${stringifyForLog(filtered)}`,
  );

  const unique = dedupeByUrl(filtered);
  const topResults = unique
    .sort((a, b) => scoreResult(b, queryTokens) - scoreResult(a, queryTokens))
    .slice(0, 3);
  console.log(
    `${BRIGHT_DATA_LOG_PREFIX} top results:\n${stringifyForLog(topResults)}`,
  );

  return topResults;
}
