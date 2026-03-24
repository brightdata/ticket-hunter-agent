import type { BrowserContext, Page } from "playwright-core";

const SCREENSHOT_TIMEOUT_MS = 5_000;
export const NAVIGATION_TIMEOUT_MS = 90_000;

export async function installSingleTabNavigation(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(() => {
    const forceCurrentTab = (root: ParentNode) => {
      for (const anchor of root.querySelectorAll('a[target="_blank"]')) {
        anchor.setAttribute("target", "_self");
        anchor.removeAttribute("rel");
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          if (node.matches('a[target="_blank"]')) {
            node.setAttribute("target", "_self");
            node.removeAttribute("rel");
          }

          forceCurrentTab(node);
        }
      }
    });

    if (document.documentElement) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    forceCurrentTab(document);
  });
}

export function applyNavigationTimeouts(
  context: BrowserContext,
  page: Page,
): void {
  context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
}

const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];

function isRetryableNavigationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes("cooldown") ||
    msg.includes("no_peers") ||
    msg.includes("ERR_CONNECTION_RESET") ||
    msg.includes("ERR_CONNECTION_CLOSED") ||
    msg.includes("Target closed") ||
    msg.includes("Session closed")
  );
}

export async function retryNavigation<T>(
  fn: () => Promise<T>,
  retries = RETRY_DELAYS_MS.length,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !isRetryableNavigationError(error)) {
        throw error;
      }
      const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export async function capturePageScreenshotDataUrl(page: Page): Promise<string> {
  process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";

  const screenshot = await page.screenshot({
    type: "jpeg",
    quality: 60,
    animations: "disabled",
    caret: "hide",
    scale: "css",
    timeout: SCREENSHOT_TIMEOUT_MS,
  });

  return `data:image/jpeg;base64,${screenshot.toString("base64")}`;
}
