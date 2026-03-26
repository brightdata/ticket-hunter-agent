import type { Page } from "playwright-core";
import { navigateWithRecovery } from "@/lib/agent/browser-utils";

export interface ViewportSize {
  w: number;
  h: number;
}

interface NavigationStatusOptions {
  onStatus?: (message: string) => void;
  signal?: AbortSignal;
}

const N1_COORDINATE_SPACE = 1000;
const DEFAULT_WAIT_MS = 800;
const DEFAULT_SCROLL_AMOUNT = 1;
const POPUP_SETTLE_MS = 1_200;
const POPUP_LOAD_TIMEOUT_MS = 10_000;
const PAGE_RECOVERY_POLL_MS = 250;

const ACTIONS = [
  "left_click",
  "double_click",
  "triple_click",
  "right_click",
  "type",
  "key_press",
  "scroll",
  "hover",
  "drag",
  "goto_url",
  "go_back",
  "refresh",
  "wait",
] as const;

type ActionType = (typeof ACTIONS)[number];
type ActionArgs = Record<string, unknown>;

interface ParsedAction {
  type: ActionType;
  args: ActionArgs;
}

interface ClickPoint {
  x: number;
  y: number;
}

interface AnchorNavigationCandidate {
  href: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeActionName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function toActionType(name: string | null | undefined): ActionType | null {
  if (!name) {
    return null;
  }

  const normalized = normalizeActionName(name);
  return ACTIONS.includes(normalized as ActionType)
    ? (normalized as ActionType)
    : null;
}

function parseArguments(value: unknown): ActionArgs {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function getString(args: ActionArgs, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function getNumber(args: ActionArgs, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function getBoolean(args: ActionArgs, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "yes") {
        return true;
      }
      if (normalized === "false" || normalized === "0" || normalized === "no") {
        return false;
      }
    }
  }

  return undefined;
}

function toNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function getCoordinatePair(
  args: ActionArgs,
  keys: string[],
): { x: number; y: number } | null {
  for (const key of keys) {
    const value = args[key];

    if (Array.isArray(value) && value.length >= 2) {
      const rawX = toNumericValue(value[0]);
      const rawY = toNumericValue(value[1]);
      if (rawX !== null && rawY !== null) {
        return { x: rawX, y: rawY };
      }
    }

    if (isRecord(value)) {
      const rawX = toNumericValue(value.x);
      const rawY = toNumericValue(value.y);
      if (rawX !== null && rawY !== null) {
        return { x: rawX, y: rawY };
      }
    }
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toViewportCoordinate(value: number, axisSize: number): number {
  if (axisSize <= 0) {
    return 0;
  }

  const scaled = Math.round((value / N1_COORDINATE_SPACE) * axisSize);
  return clamp(scaled, 0, axisSize - 1);
}

function getPoint(
  args: ActionArgs,
  viewport: ViewportSize,
  xKeys: string[],
  yKeys: string[],
  coordinatePairKeys: string[] = [],
): { x: number; y: number } | null {
  const pair = getCoordinatePair(args, coordinatePairKeys);
  if (pair) {
    return {
      x: toViewportCoordinate(pair.x, viewport.w),
      y: toViewportCoordinate(pair.y, viewport.h),
    };
  }

  const rawX = getNumber(args, xKeys);
  const rawY = getNumber(args, yKeys);

  if (rawX === undefined || rawY === undefined) {
    return null;
  }

  return {
    x: toViewportCoordinate(rawX, viewport.w),
    y: toViewportCoordinate(rawY, viewport.h),
  };
}

function getPointOrCenter(
  args: ActionArgs,
  viewport: ViewportSize,
): { x: number; y: number } {
  const point = getPoint(args, viewport, ["x"], ["y"]);
  if (point) {
    return point;
  }

  return {
    x: Math.max(0, Math.floor(viewport.w / 2)),
    y: Math.max(0, Math.floor(viewport.h / 2)),
  };
}

function normalizeKeyToken(value: string): string {
  const token = value.trim();
  const normalized = token.toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, "");

  switch (compact) {
    case "ctrl":
    case "control":
      return "Control";
    case "cmd":
    case "command":
    case "meta":
      return "Meta";
    case "opt":
    case "option":
    case "alt":
      return "Alt";
    case "shift":
      return "Shift";
    case "enter":
    case "return":
      return "Enter";
    case "esc":
    case "escape":
      return "Escape";
    case "space":
    case "spacebar":
      return "Space";
    case "backspace":
      return "Backspace";
    case "tab":
      return "Tab";
    case "delete":
    case "del":
      return "Delete";
    case "up":
    case "arrowup":
      return "ArrowUp";
    case "down":
    case "arrowdown":
      return "ArrowDown";
    case "left":
    case "arrowleft":
      return "ArrowLeft";
    case "right":
    case "arrowright":
      return "ArrowRight";
    case "pageup":
      return "PageUp";
    case "pagedown":
      return "PageDown";
    case "home":
      return "Home";
    case "end":
      return "End";
    default:
      if (token.length === 1) {
        return token.toUpperCase();
      }

      return token.charAt(0).toUpperCase() + token.slice(1);
  }
}

function normalizeKeyCombo(value: string): string {
  return value
    .split("+")
    .map((part) => normalizeKeyToken(part))
    .join("+");
}

function parseAction(action: unknown): ParsedAction {
  if (!isRecord(action)) {
    throw new Error("Invalid N1 action payload.");
  }

  const directType = toActionType(
    getString(action, ["type", "action", "action_type", "name"]),
  );

  const argsFromTopLevel: ActionArgs = { ...action };
  delete argsFromTopLevel.type;
  delete argsFromTopLevel.action;
  delete argsFromTopLevel.action_type;
  delete argsFromTopLevel.name;

  const args: ActionArgs = { ...argsFromTopLevel };

  if (isRecord(action.args)) {
    Object.assign(args, action.args);
  }
  if (isRecord(action.input)) {
    Object.assign(args, action.input);
  }
  if ("arguments" in action) {
    Object.assign(args, parseArguments(action.arguments));
  }

  let functionType: ActionType | null = null;
  if (isRecord(action.function)) {
    functionType = toActionType(getString(action.function, ["name"]));
    Object.assign(args, parseArguments(action.function.arguments));
  }

  const nestedType = toActionType(
    getString(args, ["type", "action", "action_type", "name"]),
  );
  delete args.type;
  delete args.action;
  delete args.action_type;
  delete args.name;

  const finalType = functionType ?? directType ?? nestedType;
  if (!finalType) {
    throw new Error("Unsupported N1 action type.");
  }

  return { type: finalType, args };
}

async function resolveActivePageAfterPopup(
  page: Page,
  popup: Page,
  options?: NavigationStatusOptions,
): Promise<Page> {
  await popup
    .waitForLoadState("domcontentloaded", { timeout: POPUP_LOAD_TIMEOUT_MS })
    .catch(() => {});

  let popupUrl = popup.url();

  if (!popupUrl || popupUrl === "about:blank") {
    await popup
      .waitForURL((url) => url.toString() !== "about:blank", {
        timeout: POPUP_LOAD_TIMEOUT_MS,
      })
      .catch(() => {});
    popupUrl = popup.url();
  }

  if (!page.isClosed() && popupUrl && popupUrl !== "about:blank") {
    try {
      if (popupUrl !== page.url()) {
        await navigateWithRecovery(
          page,
          () => page.goto(popupUrl, { waitUntil: "domcontentloaded" }),
          { onStatus: options?.onStatus, signal: options?.signal, retries: 0 },
        );
      }
      await popup.close().catch(() => {});
      return page;
    } catch {
      // Fall back to the popup page if the original page became unusable.
    }
  }

  if (!popup.isClosed()) {
    await popup.bringToFront().catch(() => {});
    return popup;
  }

  return page;
}

function latestOpenPage(page: Page): Page | null {
  const openPages = page
    .context()
    .pages()
    .filter((candidate) => !candidate.isClosed());

  if (openPages.includes(page)) {
    return page;
  }

  return openPages.at(-1) ?? null;
}

export async function ensureUsablePage(page: Page): Promise<Page> {
  const immediate = latestOpenPage(page);
  if (immediate) {
    return immediate;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < POPUP_LOAD_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, PAGE_RECOVERY_POLL_MS));
    const recovered = latestOpenPage(page);
    if (recovered) {
      await recovered.bringToFront().catch(() => {});
      return recovered;
    }
  }

  throw new Error("No active page available in browser context.");
}

function isDirectNavigationUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return !normalized.startsWith("javascript:");
}

async function findAnchorNavigationCandidate(
  page: Page,
  point: ClickPoint,
): Promise<AnchorNavigationCandidate | null> {
  return page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    if (!(element instanceof Element)) {
      return null;
    }

    const anchor = element.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) {
      return null;
    }

    const href = anchor.href?.trim();
    if (!href) {
      return null;
    }

    return { href };
  }, point);
}

async function clickInCurrentPage(
  page: Page,
  point: ClickPoint,
  options: {
    button: "left" | "right";
    clickCount: number;
  } & NavigationStatusOptions,
): Promise<Page> {
  const usablePage = await ensureUsablePage(page);
  const anchorCandidate = await findAnchorNavigationCandidate(usablePage, point);
  if (anchorCandidate && isDirectNavigationUrl(anchorCandidate.href)) {
    await navigateWithRecovery(
      usablePage,
      () =>
        usablePage.goto(anchorCandidate.href, { waitUntil: "domcontentloaded" }),
      { onStatus: options.onStatus, signal: options.signal, retries: 0 },
    );
    return ensureUsablePage(usablePage);
  }

  let popup: Page | null = null;
  const context = usablePage.context();
  const onPopup = (nextPage: Page) => {
    popup = nextPage;
  };
  const onContextPage = (nextPage: Page) => {
    if (nextPage !== usablePage) {
      popup = nextPage;
    }
  };

  usablePage.on("popup", onPopup);
  context.on("page", onContextPage);

  try {
    await usablePage.mouse.click(point.x, point.y, options);
    await new Promise((resolve) => setTimeout(resolve, POPUP_SETTLE_MS));

    if (popup) {
      return resolveActivePageAfterPopup(usablePage, popup, {
        onStatus: options.onStatus,
        signal: options.signal,
      });
    }
    return ensureUsablePage(usablePage);
  } finally {
    usablePage.off("popup", onPopup);
    context.off("page", onContextPage);
  }
}

export async function executeN1Action(
  page: Page,
  action: unknown,
  viewport: ViewportSize,
  options?: NavigationStatusOptions,
): Promise<Page> {
  const parsed = parseAction(action);
  const { type, args } = parsed;
  let activePage = await ensureUsablePage(page);

  if (type === "left_click") {
    const point =
      getPoint(args, viewport, ["x"], ["y"], ["coordinates"]) ??
      getPointOrCenter(args, viewport);
    return clickInCurrentPage(activePage, point, {
      button: "left",
      clickCount: 1,
      onStatus: options?.onStatus,
    });
  }

  if (type === "double_click") {
    const point =
      getPoint(args, viewport, ["x"], ["y"], ["coordinates"]) ??
      getPointOrCenter(args, viewport);
    return clickInCurrentPage(activePage, point, {
      button: "left",
      clickCount: 2,
      onStatus: options?.onStatus,
    });
  }

  if (type === "triple_click") {
    const point =
      getPoint(args, viewport, ["x"], ["y"], ["coordinates"]) ??
      getPointOrCenter(args, viewport);
    return clickInCurrentPage(activePage, point, {
      button: "left",
      clickCount: 3,
      onStatus: options?.onStatus,
    });
  }

  if (type === "right_click") {
    const point =
      getPoint(args, viewport, ["x"], ["y"], ["coordinates"]) ??
      getPointOrCenter(args, viewport);
    await activePage.mouse.click(point.x, point.y, { button: "right", clickCount: 1 });
    return ensureUsablePage(activePage);
  }

  if (type === "type") {
    const point = getPoint(args, viewport, ["x"], ["y"], ["coordinates"]);
    if (point) {
      activePage = await clickInCurrentPage(activePage, point, {
        button: "left",
        clickCount: 1,
        onStatus: options?.onStatus,
      });
    }

    const text = getString(args, ["text", "value", "input", "content"]) ?? "";
    const clearBeforeTyping =
      getBoolean(args, ["clear_before_typing", "clear"]) ?? false;
    const pressEnterAfter =
      getBoolean(args, ["press_enter_after", "enter"]) ?? false;

    if (clearBeforeTyping) {
      await activePage.keyboard.press("ControlOrMeta+A");
      await activePage.keyboard.press("Backspace");
    }

    if (text) {
      await activePage.keyboard.type(text);
    }

    if (pressEnterAfter) {
      await activePage.keyboard.press("Enter");
    }
    return ensureUsablePage(activePage);
  }

  if (type === "key_press") {
    const comboFromArray = Array.isArray(args.keys)
      ? args.keys
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
          .join("+")
      : undefined;
    const comboRaw = comboFromArray || getString(args, [
      "key_comb",
      "key_combination",
      "key_combo",
      "key_combination_to_press",
      "keys",
      "key",
      "shortcut",
    ]);
    if (!comboRaw) {
      throw new Error("key_press action is missing key combination.");
    }

    await activePage.keyboard.press(normalizeKeyCombo(comboRaw));
    return ensureUsablePage(activePage);
  }

  if (type === "scroll") {
    const point =
      getPoint(args, viewport, ["x"], ["y"], ["coordinates"]) ??
      getPointOrCenter(args, viewport);
    await activePage.mouse.move(point.x, point.y);

    const direction = getString(args, ["direction"])?.toLowerCase();
    const explicitDeltaX = getNumber(args, [
      "delta_x",
      "dx",
      "wheel_x",
      "scroll_x",
    ]);
    const explicitDeltaY = getNumber(args, [
      "delta_y",
      "dy",
      "wheel_y",
      "scroll_y",
    ]);
    const amount =
      getNumber(args, ["amount", "distance", "steps"]) ?? DEFAULT_SCROLL_AMOUNT;

    let deltaX = explicitDeltaX ?? 0;
    let deltaY = explicitDeltaY ?? 0;

    if (direction === "up") {
      deltaY = -Math.round(0.1 * viewport.h * Math.abs(amount));
    } else if (direction === "down") {
      deltaY = Math.round(0.1 * viewport.h * Math.abs(amount));
    } else if (direction === "left") {
      deltaX = -Math.round(0.1 * viewport.w * Math.abs(amount));
    } else if (direction === "right") {
      deltaX = Math.round(0.1 * viewport.w * Math.abs(amount));
    } else if (explicitDeltaX === undefined && explicitDeltaY === undefined) {
      deltaY = Math.round(0.1 * viewport.h * Math.abs(amount));
    }

    await activePage.mouse.wheel(deltaX, deltaY);
    return ensureUsablePage(activePage);
  }

  if (type === "hover") {
    const point =
      getPoint(args, viewport, ["x"], ["y"], ["coordinates"]) ??
      getPointOrCenter(args, viewport);
    await activePage.mouse.move(point.x, point.y);
    return ensureUsablePage(activePage);
  }

  if (type === "drag") {
    const fromPoint = getPoint(
      args,
      viewport,
      ["from_x", "start_x", "x"],
      ["from_y", "start_y", "y"],
      ["start_coordinates", "from_coordinates"],
    );
    const toPoint = getPoint(
      args,
      viewport,
      ["to_x", "end_x", "target_x", "x2"],
      ["to_y", "end_y", "target_y", "y2"],
      ["coordinates", "target_coordinates", "to_coordinates"],
    );

    if (!fromPoint || !toPoint) {
      throw new Error("drag action is missing start or end coordinates.");
    }

    await activePage.mouse.move(fromPoint.x, fromPoint.y);
    await activePage.mouse.down();
    await activePage.mouse.move(toPoint.x, toPoint.y, { steps: 12 });
    await activePage.mouse.up();
    return ensureUsablePage(activePage);
  }

  if (type === "goto_url") {
    const url = getString(args, ["url", "href"]);
    if (!url) {
      throw new Error("goto_url action is missing URL.");
    }

    await navigateWithRecovery(
      activePage,
      () => activePage.goto(url, { waitUntil: "domcontentloaded" }),
      { onStatus: options?.onStatus, signal: options?.signal, retries: 0 },
    );
    return ensureUsablePage(activePage);
  }

  if (type === "go_back") {
    await navigateWithRecovery(
      activePage,
      () => activePage.goBack({ waitUntil: "domcontentloaded" }),
      { onStatus: options?.onStatus, signal: options?.signal, retries: 0 },
    );
    return ensureUsablePage(activePage);
  }

  if (type === "refresh") {
    await navigateWithRecovery(
      activePage,
      () => activePage.reload({ waitUntil: "domcontentloaded" }),
      { onStatus: options?.onStatus, signal: options?.signal, retries: 0 },
    );
    return ensureUsablePage(activePage);
  }

  if (type === "wait") {
    const requestedDuration = getNumber(args, [
      "duration_ms",
      "timeout_ms",
      "duration",
      "ms",
    ]);
    const duration = clamp(
      Math.round(requestedDuration ?? DEFAULT_WAIT_MS),
      0,
      30_000,
    );
    await new Promise((resolve) => setTimeout(resolve, duration));
    return ensureUsablePage(activePage);
  }

  return ensureUsablePage(activePage);
}
