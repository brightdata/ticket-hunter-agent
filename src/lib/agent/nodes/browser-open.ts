import { chromium } from "playwright-core";
import {
  applyNavigationTimeouts,
  capturePageScreenshotDataUrl,
  installSingleTabNavigation,
  navigateWithRecovery,
} from "@/lib/agent/browser-utils";
import { setAgentRuntimeSession } from "@/lib/agent/runtime-session";
import { emitAgentEvent } from "@/lib/agent/stream-events";
import type { AgentState } from "@/lib/agent/state";
import type { ChatMessage, ChatMessageContentPart } from "@/lib/n1-client";

const VIEWPORT = { width: 1280, height: 800 };

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

export async function browserOpenNode(state: AgentState): Promise<AgentState> {
  emitAgentEvent({
    type: "status",
    message: "Connecting to browser session...",
  });

  if (!state.selectedUrl) {
    emitAgentEvent({
      type: "error",
      message: "selectedUrl is missing.",
    });
    return {
      ...state,
      browserConnected: false,
      inspectUrl: null,
      currentUrl: "",
      status: "Cannot open browser without a selected URL.",
      error: "selectedUrl is missing.",
    };
  }

  const cdpUrl = process.env.BRD_CDP_URL;
  if (!cdpUrl) {
    emitAgentEvent({
      type: "error",
      message: "Missing BRD_CDP_URL.",
    });
    return {
      ...state,
      browserConnected: false,
      inspectUrl: null,
      currentUrl: "",
      status: "Missing browser CDP configuration.",
      error: "Missing BRD_CDP_URL.",
    };
  }

  try {
    const browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    setAgentRuntimeSession({ browser, context, page });
    applyNavigationTimeouts(context, page);
    await installSingleTabNavigation(context);
    await page.setViewportSize(VIEWPORT);
    await navigateWithRecovery(
      page,
      () => page.goto(state.selectedUrl, { waitUntil: "domcontentloaded" }),
      {
        onStatus: (message) =>
          emitAgentEvent({
            type: "status",
            message,
          }),
      },
    );

    const cdpSession = await page.context().newCDPSession(page);
    const frameTree = await cdpSession.send("Page.getFrameTree");
    const frameId = frameTree.frameTree.frame.id;
    const rawCdpSession = cdpSession as {
      send(
        method: string,
        params?: Record<string, unknown>,
      ): Promise<Record<string, unknown>>;
    };
    const inspectResult = await rawCdpSession.send("Page.inspect", { frameId });
    const inspectUrl =
      inspectResult && typeof inspectResult.url === "string"
        ? inspectResult.url
        : null;
    if (inspectUrl) {
      emitAgentEvent({ type: "inspect_url", url: inspectUrl });
    }

    let screenshotDataUrl: string | undefined;
    try {
      screenshotDataUrl = await capturePageScreenshotDataUrl(page);
      emitAgentEvent({
        type: "screenshot",
        data: screenshotDataUrl,
      });
    } catch (screenshotError) {
      const screenshotMessage =
        screenshotError instanceof Error
          ? screenshotError.message
          : "Unknown screenshot error";
      emitAgentEvent({
        type: "status",
        message: `Initial screenshot failed; continuing without image. ${screenshotMessage}`,
      });
    }

    const currentUrl = page.url();
    const initialMessage = buildInitialMessage({
      query: state.query,
      currentUrl,
      screenshotDataUrl,
    });
    emitAgentEvent({
      type: "status",
      message: "Browser connected and initial context captured.",
    });

    return {
      ...state,
      browserConnected: true,
      inspectUrl,
      currentUrl,
      messages: [...state.messages, initialMessage],
      status: "Browser connected and initial context captured.",
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    emitAgentEvent({ type: "error", message });
    return {
      ...state,
      browserConnected: false,
      inspectUrl: null,
      currentUrl: "",
      status: "Failed to open browser session.",
      error: message,
    };
  }
}
