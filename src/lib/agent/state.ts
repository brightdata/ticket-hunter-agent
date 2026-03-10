import { ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";
import type { ChatMessage } from "@/lib/n1-client";
import type { TicketResult } from "@/lib/types";

export const DEFAULT_MAX_STEPS = 15;

const AgentTicketUrlSchema = z.object({
  url: z.string(),
  title: z.string(),
  platform: z.string(),
});

const ChatMessageSchema = z.custom<ChatMessage>();
const TicketResultSchema = z.custom<TicketResult>();

export const BrowserTaskSchema = new StateSchema({
  url: z.string(),
  title: z.string(),
  platform: z.string(),
  query: z.string(),
  browserConnected: z.boolean().default(false),
  inspectUrl: z.string().nullable().default(null),
  currentUrl: z.string().default(""),
  messages: z.array(ChatMessageSchema).default(() => []),
  stepCount: z.number().default(0),
  maxSteps: z.number().default(DEFAULT_MAX_STEPS),
  finalAnswer: z.string().nullable().default(null),
  tickets: z.array(TicketResultSchema).default(() => []),
  error: z.string().nullable().default(null),
});

export const AgentStateSchema = new StateSchema({
  query: z.string(),
  ticketUrls: z.array(AgentTicketUrlSchema).default(() => []),
  selectedUrl: z.string().default(""),
  browserConnected: z.boolean().default(false),
  inspectUrl: z.string().nullable().default(null),
  currentUrl: z.string().default(""),
  messages: z.array(ChatMessageSchema).default(() => []),
  stepCount: z.number().default(0),
  maxSteps: z.number().default(DEFAULT_MAX_STEPS),
  finalAnswer: z.string().nullable().default(null),
  tickets: new ReducedValue(z.array(TicketResultSchema).default(() => []), {
    reducer: (current, incoming) => current.concat(incoming),
  }),
  statusLog: new ReducedValue(z.array(z.string()).default(() => []), {
    reducer: (current, incoming) => current.concat(incoming),
  }),
  status: z.string().default("Initializing agent..."),
  error: z.string().nullable().default(null),
});

export type AgentTicketUrl = z.infer<typeof AgentTicketUrlSchema>;
export type BrowserTaskState = typeof BrowserTaskSchema.State;
export type BrowserTaskUpdate = typeof BrowserTaskSchema.Update;
export type AgentState = typeof AgentStateSchema.State;
export type AgentStateUpdate = typeof AgentStateSchema.Update;

export function createInitialAgentState(query: string): AgentState {
  return {
    query: query.trim(),
    ticketUrls: [],
    selectedUrl: "",
    browserConnected: false,
    inspectUrl: null,
    currentUrl: "",
    messages: [],
    stepCount: 0,
    maxSteps: DEFAULT_MAX_STEPS,
    finalAnswer: null,
    tickets: [],
    statusLog: [],
    status: "Initializing agent...",
    error: null,
  };
}
