import type { Browser, BrowserContext, Page } from "playwright-core";

export interface AgentRuntimeSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

let activeSession: AgentRuntimeSession | null = null;

export function setAgentRuntimeSession(session: AgentRuntimeSession): void {
  activeSession = session;
}

export function getAgentRuntimeSession(): AgentRuntimeSession | null {
  return activeSession;
}

export async function clearAgentRuntimeSession(): Promise<void> {
  if (!activeSession) {
    return;
  }

  const previous = activeSession;
  activeSession = null;

  try {
    await previous.browser.close();
  } catch {
    // no-op: best-effort cleanup
  }
}
