import { chromium } from "playwright-core";
import {
  applyNavigationTimeouts,
  capturePageScreenshotDataUrl,
  installSingleTabNavigation,
  retryNavigation,
} from "@/lib/agent/browser-utils";
import { runN1BrowseLoop } from "@/lib/agent/nodes/n1-browse-core";
import { emitAgentEvent } from "@/lib/agent/stream-events";
import {
  DEFAULT_MAX_STEPS,
  type AgentStateUpdate,
  type BrowserTaskState,
} from "@/lib/agent/state";
import type { ChatMessage, ChatMessageContentPart } from "@/lib/n1-client";
import { extractTicketsWithOpenRouter } from "@/lib/openrouter-client";
import type { TicketResult } from "@/lib/types";

const VIEWPORT = { width: 1280, height: 800 };

function withSource(platform: string, message: string): string {
  return `[${platform}] ${message}`;
}

function buildInitialMessage(args: {
  query: string;
  currentUrl: string;
  screenshotDataUrl?: string;
}): ChatMessage {
  const { query, currentUrl, screenshotDataUrl } = args;
  const content: ChatMessageContentPart[] = [
    {
      type: "text",
      text: [
        `Task: Find the best available tickets for "${query}".`,
        `You are currently on: ${currentUrl}`,
        "Use the webpage to gather ticket prices, seat locations, and availability.",
      ].join("\n"),
    },
  ];

  if (screenshotDataUrl) {
    content.push({
      type: "image_url",
      image_url: {
        url: screenshotDataUrl,
      },
    });
  }

  return {
    role: "user",
    content,
  };
}

function buildFallbackResult(
  platform: string,
  url: string,
  finalAnswer: string | null,
): TicketResult {
  return {
    eventName: "Unknown",
    eventDate: "Unknown",
    venue: "Unknown",
    city: "Unknown",
    ticketType: "Other",
    section: "Unknown",
    row: "Unknown",
    seats: "Unknown",
    quantity: "Unknown",
    price: "Unknown",
    currency: "USD",
    platform,
    url,
    notes: finalAnswer ?? "No final answer available.",
  };
}

export async function browserPipelineNode(
  taskState: BrowserTaskState,
): Promise<AgentStateUpdate> {
  const platform = taskState.platform || "Unknown";
  const seedMessages = Array.isArray(taskState.messages) ? taskState.messages : [];
  const seedStepCount = Number.isFinite(taskState.stepCount)
    ? taskState.stepCount
    : 0;
  const seedMaxSteps =
    Number.isFinite(taskState.maxSteps) && taskState.maxSteps > 0
      ? taskState.maxSteps
      : DEFAULT_MAX_STEPS;
  const seedFinalAnswer =
    typeof taskState.finalAnswer === "string" ? taskState.finalAnswer : null;

  const statusLog: string[] = [];

  const logStatus = (message: string) => {
    const line = withSource(platform, message);
    statusLog.push(line);
    emitAgentEvent({ type: "status", message: line, source: platform });
  };

  if (!taskState.url) {
    logStatus("Missing URL, skipping browser pipeline.");
    return {
      tickets: [],
      statusLog,
    };
  }

  const cdpUrl = process.env.BRD_CDP_URL;
  if (!cdpUrl) {
    logStatus("Missing BRD_CDP_URL, skipping browser pipeline.");
    return {
      tickets: [],
      statusLog,
    };
  }

  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;

  try {
    logStatus(`Connecting browser to ${taskState.url}`);
    browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());

    applyNavigationTimeouts(context, page);
    await installSingleTabNavigation(context);
    await page.setViewportSize(VIEWPORT);
    await retryNavigation(() =>
      page.goto(taskState.url, { waitUntil: "domcontentloaded" }),
    );

    let screenshotDataUrl: string | undefined;
    try {
      screenshotDataUrl = await capturePageScreenshotDataUrl(page);
      emitAgentEvent({ type: "screenshot", data: screenshotDataUrl, source: platform });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown screenshot error";
      logStatus(`Initial screenshot failed: ${message}`);
    }

    const currentUrl = page.url();
    const initialMessage = buildInitialMessage({
      query: taskState.query,
      currentUrl,
      screenshotDataUrl,
    });
    logStatus("Browser connected and initial context captured.");

    const browseResult = await runN1BrowseLoop(page, {
      messages: [...seedMessages, initialMessage],
      stepCount: seedStepCount,
      maxSteps: seedMaxSteps,
      currentUrl,
      finalAnswer: seedFinalAnswer,
      status: "N1 browse loop started.",
      source: platform,
    });

    if (browseResult.error) {
      logStatus(`Browse loop failed: ${browseResult.error}`);
      return {
        tickets: [],
        statusLog,
      };
    }

    const finalAnswer = browseResult.finalAnswer?.trim() ?? "";
    const fallbackUrl = currentUrl || taskState.url;

    if (!finalAnswer) {
      logStatus("No final answer from browse loop; returning fallback result.");
      return {
        tickets: [
          buildFallbackResult(platform, fallbackUrl, "No final answer available."),
        ],
        statusLog,
      };
    }

    try {
      const tickets = await extractTicketsWithOpenRouter({
        query: taskState.query,
        finalAnswer,
        selectedUrl: fallbackUrl,
        fallbackPlatform: platform,
      });

      if (tickets.length > 0) {
        logStatus(`Extracted ${tickets.length} ticket results.`);
        return {
          tickets,
          statusLog,
        };
      }

      logStatus("Structured extraction returned no tickets; using fallback result.");
      return {
        tickets: [buildFallbackResult(platform, fallbackUrl, finalAnswer)],
        statusLog,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown OpenRouter error";
      logStatus(`Structured extraction failed: ${message}`);
      return {
        tickets: [buildFallbackResult(platform, fallbackUrl, finalAnswer)],
        statusLog,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logStatus(`Browser pipeline failed: ${message}`);
    return {
      tickets: [],
      statusLog,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
