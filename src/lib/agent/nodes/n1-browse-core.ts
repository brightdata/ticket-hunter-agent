import type { Page } from "playwright-core";
import { capturePageScreenshotDataUrl } from "@/lib/agent/browser-utils";
import { emitAgentEvent } from "@/lib/agent/stream-events";
import { ensureUsablePage, executeN1Action } from "@/lib/agent/tools";
import type { ChatMessage } from "@/lib/n1-client";
import { callN1 } from "@/lib/n1-client";

const SYSTEM_PROMPT = [
  "You are a web browsing agent specialized in finding ticket information.",
  "Navigate the page to find available tickets, their prices, seat locations, and availability.",
  "When you provide your final findings, include event metadata: event name, event date, venue, and city.",
  "For each ticket option, include ticket type, section, row, seats, quantity, price, currency, platform, URL, and notes.",
  "If any field is unavailable, explicitly write Unknown.",
  "Stop as soon as you have gathered enough ticket information to answer the user's query.",
  "When you see '[Steps remaining: N]' and N <= 3, stop and compile your findings.",
].join(" ");

const VIEWPORT = {
  w: 1280,
  h: 800,
};

export interface N1BrowseTaskState {
  messages: ChatMessage[];
  stepCount: number;
  maxSteps: number;
  currentUrl: string;
  finalAnswer: string | null;
  status: string;
  source?: string;
}

export interface N1BrowseTaskResult {
  messages: ChatMessage[];
  stepCount: number;
  currentUrl: string;
  finalAnswer: string | null;
  status: string;
  error: string | null;
}

function ensureSystemPrompt(messages: ChatMessage[]): ChatMessage[] {
  if (messages.some((message) => message.role === "system")) {
    return [...messages];
  }

  return [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
}

function describeToolCall(toolCall: unknown): string {
  if (
    typeof toolCall === "object" &&
    toolCall !== null &&
    "type" in toolCall &&
    toolCall.type === "function" &&
    "function" in toolCall &&
    typeof toolCall.function === "object" &&
    toolCall.function !== null &&
    "name" in toolCall.function &&
    typeof toolCall.function.name === "string"
  ) {
    return toolCall.function.name;
  }

  return "browser_action";
}

function extractToolCallId(toolCall: unknown): string | null {
  if (
    typeof toolCall === "object" &&
    toolCall !== null &&
    "id" in toolCall &&
    typeof toolCall.id === "string"
  ) {
    return toolCall.id;
  }

  return null;
}

export async function runN1BrowseLoop(
  page: Page,
  taskState: N1BrowseTaskState,
): Promise<N1BrowseTaskResult> {
  const source = taskState.source;
  let activePage = page;

  emitAgentEvent({
    type: "status",
    message: "Starting N1 browse loop...",
    source,
  });

  activePage = await ensureUsablePage(activePage);
  const messages = ensureSystemPrompt(taskState.messages);
  let stepCount = taskState.stepCount;
  let status = taskState.status;
  let currentUrl = taskState.currentUrl || activePage.url();
  let finalAnswer = taskState.finalAnswer;

  try {
    while (stepCount < taskState.maxSteps) {
      const stepsRemaining = Math.max(taskState.maxSteps - stepCount, 0);
      const response = await callN1([
        ...messages,
        {
          role: "user",
          content: `[Steps remaining: ${stepsRemaining}] Continue only if another browser action is required.`,
        },
      ]);

      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      });

      if (!response.tool_calls || response.tool_calls.length === 0) {
        activePage = await ensureUsablePage(activePage);
        finalAnswer = response.content;
        status = "N1 browsing completed.";
        emitAgentEvent({ type: "status", message: status, source });
        currentUrl = activePage.url();
        break;
      }

      for (const toolCall of response.tool_calls) {
        if (stepCount >= taskState.maxSteps) {
          break;
        }

        const actionDescription = describeToolCall(toolCall);
        activePage = await executeN1Action(activePage, toolCall, VIEWPORT);
        activePage = await ensureUsablePage(activePage);
        stepCount += 1;
        currentUrl = activePage.url();
        status = `Step ${stepCount}: ${actionDescription}`;
        emitAgentEvent({ type: "status", message: status, source });

        const toolCallId = extractToolCallId(toolCall);
        if (toolCallId) {
          messages.push({
            role: "tool",
            tool_call_id: toolCallId,
            content: JSON.stringify({
              status: "ok",
              current_url: currentUrl,
            }),
          });
        }

        let screenshotDataUrl: string | null = null;

        try {
          activePage = await ensureUsablePage(activePage);
          screenshotDataUrl = await capturePageScreenshotDataUrl(activePage);
          emitAgentEvent({ type: "screenshot", data: screenshotDataUrl, source });
        } catch (error) {
          const screenshotMessage =
            error instanceof Error ? error.message : "Unknown screenshot error";
          emitAgentEvent({
            type: "status",
            message: `Screenshot capture failed after ${actionDescription}; continuing without image. ${screenshotMessage}`,
            source,
          });
        }

        const remainingAfterAction = Math.max(taskState.maxSteps - stepCount, 0);
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Action result: ${actionDescription}`,
                `Current URL: ${currentUrl}`,
                `[Steps remaining: ${remainingAfterAction}]`,
              ].join("\n"),
            },
            ...(screenshotDataUrl
              ? [
                  {
                    type: "image_url" as const,
                    image_url: { url: screenshotDataUrl },
                  },
                ]
              : []),
          ],
        });
      }
    }

    if (!finalAnswer && stepCount >= taskState.maxSteps) {
      const finalizeResponse = await callN1([
        ...messages,
        {
          role: "user",
          content:
            "[Steps remaining: 0] Stop browsing now and provide your final ticket findings.",
        },
      ]);

      messages.push({
        role: "assistant",
        content: finalizeResponse.content,
        tool_calls: finalizeResponse.tool_calls,
      });

      finalAnswer =
        finalizeResponse.content ||
        "Maximum step limit reached before a final answer was produced.";
      status = `Reached max browsing steps (${taskState.maxSteps}). Finalized response.`;
      emitAgentEvent({ type: "status", message: status, source });
    }

    return {
      messages,
      stepCount,
      currentUrl: currentUrl || activePage.url(),
      finalAnswer,
      status,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    emitAgentEvent({ type: "error", message, source });
    return {
      messages,
      stepCount,
      currentUrl,
      finalAnswer,
      status: "N1 browsing failed.",
      error: message,
    };
  }
}
