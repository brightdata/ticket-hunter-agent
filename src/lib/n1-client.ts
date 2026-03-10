import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions/completions";

const YUTORI_BASE_URL = "https://api.yutori.com/v1";
const YUTORI_MODEL = "n1-latest";

export type ChatMessageContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

export type ChatMessageContent = string | ChatMessageContentPart[];

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: ChatMessageContent;
  tool_call_id?: string;
  tool_calls?: ChatCompletionMessageToolCall[];
}

export interface N1Response {
  content: string;
  tool_calls: ChatCompletionMessageToolCall[];
}

export const n1Client = new OpenAI({
  apiKey: process.env.YUTORI_API_KEY ?? "missing-yutori-api-key",
  baseURL: YUTORI_BASE_URL,
});

function contentToText(content: ChatMessageContent): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }

      return part.image_url.url;
    })
    .filter(Boolean)
    .join("\n");
}

function toOpenAIMessage(message: ChatMessage): ChatCompletionMessageParam {
  if (message.role === "tool") {
    if (!message.tool_call_id) {
      throw new Error("Tool messages must include tool_call_id.");
    }

    return {
      role: "tool",
      tool_call_id: message.tool_call_id,
      content: contentToText(message.content),
    };
  }

  if (message.role === "assistant") {
    const assistantMessage = {
      role: "assistant",
      content: message.content,
      tool_calls: message.tool_calls,
    };
    return assistantMessage as ChatCompletionMessageParam;
  }

  if (message.role === "system") {
    return {
      role: "system",
      content: contentToText(message.content),
    };
  }

  const userMessage = {
    role: "user",
    content: message.content,
  };
  return userMessage as ChatCompletionMessageParam;
}

function extractContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!content) {
    return "";
  }

  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => {
        if (
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          "text" in part &&
          part.type === "text" &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

export async function callN1(messages: ChatMessage[]): Promise<N1Response> {
  if (!process.env.YUTORI_API_KEY) {
    throw new Error("Missing YUTORI_API_KEY.");
  }

  const completion = await n1Client.chat.completions.create({
    model: YUTORI_MODEL,
    messages: messages.map(toOpenAIMessage),
  });

  const choice = completion.choices[0];
  if (!choice) {
    throw new Error("Yutori N1 returned no choices.");
  }

  const content = extractContentText(choice.message.content);

  return {
    content,
    tool_calls: choice.message.tool_calls ?? [],
  };
}
