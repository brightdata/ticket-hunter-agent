import { getAgentRuntimeSession } from "@/lib/agent/runtime-session";
import { emitAgentEvent } from "@/lib/agent/stream-events";
import type { AgentState } from "@/lib/agent/state";
import { runN1BrowseLoop } from "@/lib/agent/nodes/n1-browse-core";

export async function n1BrowseNode(state: AgentState): Promise<AgentState> {
  const session = getAgentRuntimeSession();
  if (!session) {
    emitAgentEvent({
      type: "error",
      message: "Missing active browser session.",
    });
    return {
      ...state,
      status: "Browser session is not available for browsing.",
      error: "Missing active browser session.",
    };
  }

  const browseResult = await runN1BrowseLoop(session.page, state);

  return {
    ...state,
    ...browseResult,
  };
}
