import { END, START, Send, StateGraph } from "@langchain/langgraph";
import { browserPipelineNode } from "@/lib/agent/nodes/browser-pipeline";
import { mergeAndRankNode } from "@/lib/agent/nodes/merge-and-rank";
import { serpSearchNode } from "@/lib/agent/nodes/serp-search";
import {
  DEFAULT_MAX_STEPS,
  AgentStateSchema,
  BrowserTaskSchema,
  type AgentState,
} from "@/lib/agent/state";

export function fanOutToUrls(
  state: AgentState,
): typeof END | Send[] {
  const urls = state.ticketUrls.slice(0, 3);

  if (urls.length === 0) {
    return END;
  }

  return urls.map(
    (urlEntry) =>
      new Send("browserPipeline", {
        url: urlEntry.url,
        title: urlEntry.title,
        platform: urlEntry.platform,
        query: state.query,
        browserConnected: false,
        inspectUrl: null,
        currentUrl: "",
        messages: [],
        stepCount: 0,
        maxSteps: DEFAULT_MAX_STEPS,
        finalAnswer: null,
        tickets: [],
        error: null,
      }),
  );
}

const workflow = new StateGraph(AgentStateSchema)
  .addNode("serpSearch", serpSearchNode)
  .addNode("browserPipeline", browserPipelineNode, {
    input: BrowserTaskSchema,
  })
  .addNode("mergeAndRank", mergeAndRankNode)
  .addEdge(START, "serpSearch")
  .addConditionalEdges("serpSearch", fanOutToUrls)
  .addEdge("browserPipeline", "mergeAndRank")
  .addEdge("mergeAndRank", END);

export const ticketHunterAgent = workflow.compile();

export async function runTicketHunterAgent(
  initialState: AgentState,
): Promise<AgentState> {
  const result = await ticketHunterAgent.invoke(initialState);
  return result as AgentState;
}
