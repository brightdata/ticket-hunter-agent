import type {
  BrowserContext,
  CDPSession,
  Page,
  Response as PlaywrightResponse,
} from "playwright-core";

const SCREENSHOT_TIMEOUT_MS = 5_000;
export const NAVIGATION_TIMEOUT_MS = 90_000;
const CAPTCHA_SOLVE_TIMEOUT_MS = 45_000;
const CAPTCHA_POLL_MS = 500;
const CAPTCHA_SETTLE_MS = 1_500;
const BLOCK_TEXT_SAMPLE_LIMIT = 4_000;
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
const COOLDOWN_RETRY_DELAYS_MS = [15_000, 30_000, 60_000];
const FAST_RETRY_DELAYS_MS = [1_000, 3_000, 7_000];
const FAST_COOLDOWN_RETRY_DELAYS_MS = [0, 2_000, 5_000];
const BLOCKED_STATUS_CODES = new Set([403, 429, 430, 503, 520, 521, 522, 523]);
const HARD_BLOCK_PATTERNS = [
  "captcha",
  "verify you are human",
  "verify you're human",
  "access denied",
  "unusual traffic",
  "request blocked",
  "temporarily blocked",
  "security challenge",
  "attention required",
  "pardon the interruption",
  "robot or human",
  "cf-chl",
  "cf challenge",
] as const;
const SOFT_BLOCK_PATTERNS = [
  "security check",
  "checking your browser",
  "please enable cookies",
  "cloudflare",
  "perimeterx",
  "incapsula",
  "recaptcha",
  "hcaptcha",
  "automated queries",
] as const;

type RetryNavigationOptions = {
  retries?: number;
  onRetry?: (details: {
    attempt: number;
    delayMs: number;
    error: string;
    cause: unknown;
  }) => void | Promise<void>;
  signal?: AbortSignal;
  getRetryDelays?: (error: unknown) => number[];
};

export type NavigateWithRecoveryOptions = RetryNavigationOptions & {
  onStatus?: (message: string) => void;
  recoverPage?: (details: {
    attempt: number;
    error: unknown;
    page: Page;
  }) => Promise<Page>;
};

type CaptchaCounts = {
  detected: number;
  solveFinished: number;
  solveFailed: number;
};

type CaptchaTracker = {
  session: CDPSession;
  snapshot: () => CaptchaCounts;
  dispose: () => Promise<void>;
};

type BrightDataCaptchaSession = CDPSession & {
  on(event: string, listener: () => void): BrightDataCaptchaSession;
};

const captchaTrackerByPage = new WeakMap<Page, CaptchaTracker>();

export class RetryableNavigationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableNavigationError";
  }
}

export class NavigationAbortedError extends Error {
  constructor(message = "Navigation aborted.") {
    super(message);
    this.name = "NavigationAbortedError";
  }
}

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

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new NavigationAbortedError();
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      reject(new NavigationAbortedError());
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function cloneCounts(counts: CaptchaCounts): CaptchaCounts {
  return {
    detected: counts.detected,
    solveFinished: counts.solveFinished,
    solveFailed: counts.solveFailed,
  };
}

async function ensureCaptchaTracker(page: Page): Promise<CaptchaTracker> {
  const existing = captchaTrackerByPage.get(page);
  if (existing) {
    return existing;
  }

  const counts: CaptchaCounts = {
    detected: 0,
    solveFinished: 0,
    solveFailed: 0,
  };

  const session = (await page.context().newCDPSession(
    page,
  )) as BrightDataCaptchaSession;
  session.on("Captcha.detected", () => {
    counts.detected += 1;
  });
  session.on("Captcha.solveFinished", () => {
    counts.solveFinished += 1;
  });
  session.on("Captcha.solveFailed", () => {
    counts.solveFailed += 1;
  });

  const tracker: CaptchaTracker = {
    session,
    snapshot: () => cloneCounts(counts),
    dispose: async () => {
      await session.detach().catch(() => {});
    },
  };

  captchaTrackerByPage.set(page, tracker);
  page.once("close", () => {
    captchaTrackerByPage.delete(page);
    void tracker.dispose();
  });

  return tracker;
}

function isRetryableNavigationError(error: unknown): boolean {
  if (error instanceof NavigationAbortedError) {
    return false;
  }

  if (error instanceof RetryableNavigationError) {
    return true;
  }

  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes("cooldown") ||
    msg.includes("no_peers") ||
    msg.includes("ERR_CONNECTION_RESET") ||
    msg.includes("ERR_CONNECTION_CLOSED") ||
    msg.includes("ERR_TUNNEL_CONNECTION_FAILED") ||
    msg.includes("ERR_PROXY_CONNECTION_FAILED") ||
    msg.includes("Target closed") ||
    msg.includes("Session closed")
  );
}

function isCooldownNavigationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("cooldown") || error.message.includes("no_peers"))
  );
}

function getRetryDelaysForError(error: unknown): number[] {
  if (isCooldownNavigationError(error)) {
    return COOLDOWN_RETRY_DELAYS_MS;
  }

  return RETRY_DELAYS_MS;
}

export function isNavigationAbortedError(error: unknown): boolean {
  return (
    error instanceof NavigationAbortedError ||
    (error instanceof Error && error.name === "NavigationAbortedError")
  );
}

function describeBlockIndicators(text: string): string | null {
  const hardMatches = HARD_BLOCK_PATTERNS.filter((pattern) =>
    text.includes(pattern),
  );
  if (hardMatches.length > 0) {
    return hardMatches[0] ?? null;
  }

  const softMatches = SOFT_BLOCK_PATTERNS.filter((pattern) =>
    text.includes(pattern),
  );
  if (softMatches.length >= 2) {
    return softMatches.slice(0, 2).join(", ");
  }

  return null;
}

async function waitForCaptchaOutcome(
  tracker: CaptchaTracker,
  baseline: CaptchaCounts,
  onStatus?: (message: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const initial = tracker.snapshot();
  if (initial.detected <= baseline.detected) {
    return;
  }

  onStatus?.("Bright Data detected a captcha challenge. Waiting for auto-solve.");

  const startedAt = Date.now();
  while (Date.now() - startedAt < CAPTCHA_SOLVE_TIMEOUT_MS) {
    throwIfAborted(signal);
    const current = tracker.snapshot();

    if (current.solveFailed > baseline.solveFailed) {
      throw new RetryableNavigationError(
        "Bright Data captcha solving failed.",
      );
    }

    if (current.solveFinished > baseline.solveFinished) {
      onStatus?.("Bright Data captcha solved. Validating page state.");
      await sleep(CAPTCHA_SETTLE_MS, signal);
      return;
    }

    await sleep(CAPTCHA_POLL_MS, signal);
  }

  throw new RetryableNavigationError(
    "Captcha was detected, but solving did not finish in time.",
  );
}

async function assertPageIsNotBlocked(
  page: Page,
  response: PlaywrightResponse | null,
): Promise<void> {
  const statusCode = response?.status();
  if (statusCode && BLOCKED_STATUS_CODES.has(statusCode)) {
    throw new RetryableNavigationError(
      `Target site returned a retryable blocking status (${statusCode}).`,
    );
  }

  const [title, textSample] = await Promise.all([
    page.title().catch(() => ""),
    page
      .evaluate((limit: number) => {
        const text =
          document.body?.innerText ?? document.documentElement?.innerText ?? "";
        return text.slice(0, limit);
      }, BLOCK_TEXT_SAMPLE_LIMIT)
      .catch(() => ""),
  ]);

  const normalized = [page.url(), title, textSample].join("\n").toLowerCase();
  const indicator = describeBlockIndicators(normalized);
  if (!indicator) {
    return;
  }

  throw new RetryableNavigationError(
    `Detected a likely block or captcha page (${indicator}).`,
  );
}

export async function retryNavigation<T>(
  fn: () => Promise<T>,
  options?: number | RetryNavigationOptions,
): Promise<T> {
  const resolvedOptions =
    typeof options === "number" ? { retries: options } : options;

  for (let attempt = 0; ; attempt++) {
    throwIfAborted(resolvedOptions?.signal);

    try {
      return await fn();
    } catch (error) {
      throwIfAborted(resolvedOptions?.signal);

      const retryDelays =
        resolvedOptions?.getRetryDelays?.(error) ?? getRetryDelaysForError(error);
      const retries = resolvedOptions?.retries ?? retryDelays.length;
      if (attempt >= retries || !isRetryableNavigationError(error)) {
        throw error;
      }
      const delay = retryDelays[attempt] ?? retryDelays.at(-1)!;
      await resolvedOptions?.onRetry?.({
        attempt,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
        cause: error,
      });
      await sleep(delay, resolvedOptions?.signal);
    }
  }
}

export async function navigateWithRecovery(
  page: Page,
  navigate: () => Promise<PlaywrightResponse | null>,
  options?: NavigateWithRecoveryOptions,
): Promise<PlaywrightResponse | null> {
  let activePage = page;

  return retryNavigation(
    async () => {
      const tracker = await ensureCaptchaTracker(activePage);
      const baseline = tracker.snapshot();
      const response = await navigate();
      await waitForCaptchaOutcome(
        tracker,
        baseline,
        options?.onStatus,
        options?.signal,
      );
      await assertPageIsNotBlocked(activePage, response);
      return response;
    },
    {
      retries: options?.retries,
      signal: options?.signal,
      getRetryDelays: (error) =>
        options?.getRetryDelays?.(error) ??
        (options?.recoverPage
          ? isCooldownNavigationError(error)
            ? FAST_COOLDOWN_RETRY_DELAYS_MS
            : FAST_RETRY_DELAYS_MS
          : getRetryDelaysForError(error)),
      onRetry: async ({ attempt, delayMs, error, cause }) => {
        let usedFreshSession = false;

        if (options?.recoverPage) {
          activePage = await options.recoverPage({
            attempt,
            error: cause,
            page: activePage,
          });
          usedFreshSession = true;
        }

        await options?.onRetry?.({ attempt, delayMs, error, cause });

        const retryTiming =
          delayMs > 0
            ? `Retrying in ${Math.ceil(delayMs / 1000)}s.`
            : "Retrying now.";
        const recoveryNote = usedFreshSession
          ? " Opened a fresh browser session."
          : "";
        options?.onStatus?.(
          `Navigation attempt ${attempt + 1} failed: ${error}.${recoveryNote} ${retryTiming}`.trim(),
        );
      },
    },
  );
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
