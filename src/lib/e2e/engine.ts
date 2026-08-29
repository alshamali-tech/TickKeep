/* End-to-end engine — drives the real UI with genuine DOM events.
 * The store is snapshotted before a run and restored after, so live data
 * is never harmed. */

import { createFreshState, flushPersist, useStore, type AppState } from "../store";

export interface TestCase {
  name: string;
  fn: (t: Ctx) => Promise<void>;
}

export interface SuiteDef {
  name: string;
  tests: TestCase[];
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function poll(check: () => boolean, timeout: number, what: string): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (check()) return;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(40);
  }
}

const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
};

export class Ctx {
  store = (): AppState => useStore.getState();

  async nav(hash: string): Promise<void> {
    window.location.hash = hash;
    await sleep(140);
    /* Lazy routes mount behind a Suspense loader on first visit; wait for the
     * chunk to resolve so DOM queries below don't race the fallback. */
    const deadline = Date.now() + 5000;
    while (document.querySelector('[aria-label="Loading page"]') && Date.now() < deadline) {
      await sleep(60);
    }
    await sleep(60);
  }

  q(sel: string): HTMLElement | null {
    return document.querySelector(sel);
  }

  qa(sel: string): HTMLElement[] {
    return [...document.querySelectorAll(sel)] as HTMLElement[];
  }

  async waitFor(sel: string, timeout = 4000): Promise<HTMLElement> {
    let found: HTMLElement | null = null;
    await poll(() => ((found = this.q(sel)), found !== null), timeout, `selector “${sel}”`);
    return found as unknown as HTMLElement;
  }

  async waitForGone(sel: string, timeout = 4000): Promise<void> {
    await poll(() => !this.q(sel), timeout, `“${sel}” to disappear`);
  }

  /* innerText honors CSS text-transform, so capitalized labels need CI match */
  async waitForText(text: string, timeout = 4000): Promise<void> {
    await poll(() => document.body.innerText.includes(text), timeout, `text “${text}”`);
  }

  async waitForTextCI(text: string, timeout = 4000): Promise<void> {
    const needle = text.toLowerCase();
    await poll(() => document.body.innerText.toLowerCase().includes(needle), timeout, `text “${text}”`);
  }

  async waitForH1(text: string, timeout = 4000): Promise<void> {
    await poll(
      () => [...document.querySelectorAll("h1")].some((h) => (h.textContent || "").trim() === text),
      timeout,
      `page titled “${text}”`
    );
  }

  async click(sel: string, timeout = 4000): Promise<void> {
    const el = await this.waitFor(sel, timeout);
    await this.clickEl(el);
  }

  async clickEl(el: HTMLElement): Promise<void> {
    el.scrollIntoView({ block: "center" });
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(80);
  }

  /** Visible-text click; prefers matches inside <main> over sidebar/nav hits. */
  async clickText(text: string, timeout = 4000): Promise<void> {
    let el: HTMLElement | null = null;
    await poll(() => ((el = this.findText(text)), el !== null), timeout, `clickable text “${text}”`);
    await this.clickEl(el as unknown as HTMLElement);
  }

  /** Click the most recently added match (e.g. the newest toast's action button). */
  async clickLastText(text: string, timeout = 4000): Promise<void> {
    let els: HTMLElement[] = [];
    await poll(() => ((els = this.findAllText(text)), els.length > 0), timeout, `clickable text “${text}”`);
    await this.clickEl(els[els.length - 1]);
  }

  findAllText(text: string): HTMLElement[] {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits: HTMLElement[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) {
      if ((n.textContent || "").trim() === text.trim()) {
        const el = (n.parentElement ?? null) as HTMLElement | null;
        if (el) hits.push(el);
      }
    }
    return hits;
  }

  findText(text: string): HTMLElement | null {
    const hits = this.findAllText(text);
    if (hits.length === 0) return null;
    const main = this.q("main");
    const inMain = hits.filter((h) => main?.contains(h));
    const pool = inMain.length ? inMain : hits;
    let el: HTMLElement | null = pool[0];
    while (el && el !== document.body) {
      const tag = el.tagName;
      if (tag === "BUTTON" || tag === "A" || el.getAttribute("role") === "button" || el.getAttribute("role") === "tab" || el.getAttribute("role") === "checkbox" || el.getAttribute("role") === "switch" || el.getAttribute("role") === "menuitem") {
        return el;
      }
      el = el.parentElement;
    }
    return pool[0];
  }

  async typeEl(el: HTMLElement, text: string): Promise<void> {
    el.focus();
    setNativeValue(el as HTMLInputElement, text);
    await sleep(60);
  }

  async typeField(label: string, text: string, root: ParentNode = document): Promise<void> {
    const labels = [...root.querySelectorAll("label")];
    const lab = labels.find((l) => (l.textContent || "").trim().toLowerCase().startsWith(label.toLowerCase()));
    if (!lab) throw new Error(`No field labelled “${label}”`);
    const id = lab.getAttribute("for");
    const input = (id ? root.querySelector(`#${CSS.escape(id)}`) : lab.querySelector("input, textarea, select")) as HTMLElement | null;
    if (!input) throw new Error(`Field “${label}” has no input`);
    if (input instanceof HTMLSelectElement) {
      input.value = text;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(40);
      return;
    }
    await this.typeEl(input, text);
  }

  byLabel(label: string, root: ParentNode = document): HTMLElement | null {
    const labels = [...root.querySelectorAll("label")];
    const lab = labels.find((l) => (l.textContent || "").trim().toLowerCase().startsWith(label.toLowerCase()));
    if (!lab) return null;
    const id = lab.getAttribute("for");
    return (id ? root.querySelector(`#${CSS.escape(id)}`) : lab.querySelector("input, textarea, select")) as HTMLElement | null;
  }

  key(opts: { key: string; ctrl?: boolean; shift?: boolean }): void {
    const el = (document.activeElement as HTMLElement | null) ?? document.body;
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: opts.key, ctrlKey: opts.ctrl, metaKey: opts.ctrl, shiftKey: opts.shift, bubbles: true })
    );
  }

  keyDoc(key: string): void {
    const el = (document.activeElement as HTMLElement | null) ?? document.body;
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }

  async switchByLabel(label: string, target: boolean): Promise<void> {
    const sw = this.qa('[role="switch"]').find((s) => {
      const lab = s.getAttribute("aria-label") || s.closest("label")?.textContent || "";
      return lab.toLowerCase().includes(label.toLowerCase());
    });
    if (!sw) throw new Error(`No switch labelled “${label}”`);
    const checked = sw.getAttribute("aria-checked") === "true";
    if (checked !== target) await this.clickEl(sw);
  }

  async setFiles(input: HTMLInputElement, files: File[]): Promise<void> {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(250);
  }

  makeFile(name: string, content: string, type: string): File {
    return new File([content], name, { type });
  }

  rowWith(text: string, rowSel = "li, tr, article"): HTMLElement | null {
    for (const row of this.qa(rowSel)) {
      if ((row.textContent || "").includes(text)) return row;
    }
    return null;
  }

  async waitForRow(text: string, rowSel = "li, tr, article", timeout = 4000): Promise<HTMLElement> {
    let row: HTMLElement | null = null;
    await poll(() => ((row = this.rowWith(text, rowSel)), row !== null), timeout, `row containing “${text}”`);
    return row as unknown as HTMLElement;
  }

  assert(cond: unknown, msg: string): void {
    if (!cond) throw new Error(msg);
  }

  assertNoOverflow(): void {
    const diff = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    this.assert(diff <= 2, `horizontal overflow of ${diff}px`);
  }

  wait = sleep;
}

export type TestStatus = "pending" | "running" | "pass" | "fail";

export interface TestResult {
  suite: string;
  name: string;
  status: TestStatus;
  ms: number;
  error?: string;
}

export async function runSuite(
  suite: SuiteDef,
  emit: (r: TestResult) => void,
  isAborted: () => boolean
): Promise<void> {
  const t = new Ctx();
  for (const test of suite.tests) {
    if (isAborted()) return;
    emit({ suite: suite.name, name: test.name, status: "running", ms: 0 });
    const t0 = performance.now();
    try {
      await test.fn(t);
      emit({ suite: suite.name, name: test.name, status: "pass", ms: Math.round(performance.now() - t0) });
    } catch (e) {
      emit({
        suite: suite.name,
        name: test.name,
        status: "fail",
        ms: Math.round(performance.now() - t0),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/* ---------------- module-level bench runner ----------------
 * Test cases navigate the app to other routes, which UNMOUNTS the bench
 * page — so the run cannot live in component state. This store survives
 * navigation; the bench re-subscribes whenever it (re)mounts and always
 * shows live progress and final results. */

export interface LogLine {
  t: string;
  kind: "info" | "suite" | "pass" | "fail" | "done";
  text: string;
}

export interface BenchState {
  running: boolean;
  aborted: boolean;
  results: TestResult[];
  log: LogLine[];
  current: string | null;
  lastRunAt: string | null;
}

const stamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

let bench: BenchState = {
  running: false,
  aborted: false,
  results: [],
  log: [],
  current: null,
  lastRunAt: null,
};
const benchListeners = new Set<() => void>();

const setBench = (patch: Partial<BenchState>): void => {
  bench = { ...bench, ...patch };
  benchListeners.forEach((l) => l());
};

export const getBench = (): BenchState => bench;
export const subscribeBench = (l: () => void): (() => void) => {
  benchListeners.add(l);
  return () => {
    benchListeners.delete(l);
  };
};
export const abortBench = (): void => setBench({ aborted: true });

const pushLog = (kind: LogLine["kind"], text: string): void =>
  setBench({ log: [...bench.log.slice(-600), { t: stamp(), kind, text }] });

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(
      () => reject(new Error(`timed out after ${Math.round(ms / 1000)}s (${what})`)),
      ms
    );
    p.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(id);
        reject(e);
      }
    );
  });
}

/** Close stray dialogs and return to neutral ground between suites. */
async function settle(): Promise<void> {
  for (const target of [document.activeElement as HTMLElement | null, document.body]) {
    target?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  if (!window.location.hash.startsWith("#/app/tests")) window.location.hash = "#/app";
  await sleep(260);
}

export async function runAllBench(suites: SuiteDef[]): Promise<void> {
  if (bench.running) return;
  setBench({ running: true, aborted: false, results: [], log: [], current: null });
  pushLog("info", "Snapshot of local data taken — it will be restored after the run.");
  const restore = snapshotAndReset();
  pushLog("info", "Store reset to a fresh ledger for deterministic runs.");
  const t = new Ctx();
  try {
    for (const suite of suites) {
      if (bench.aborted) break;
      pushLog("suite", suite.name);
      for (const test of suite.tests) {
        if (bench.aborted) break;
        setBench({ current: `${suite.name} › ${test.name}` });
        const t0 = performance.now();
        try {
          await withTimeout(test.fn(t), 12000, test.name);
          const r: TestResult = { suite: suite.name, name: test.name, status: "pass", ms: Math.round(performance.now() - t0) };
          setBench({ results: [...bench.results, r] });
          pushLog("pass", `✓ ${test.name} (${r.ms}ms)`);
        } catch (e) {
          const r: TestResult = {
            suite: suite.name,
            name: test.name,
            status: "fail",
            ms: Math.round(performance.now() - t0),
            error: e instanceof Error ? e.message : String(e),
          };
          setBench({ results: [...bench.results, r] });
          pushLog("fail", `✗ ${test.name} — ${r.error}`);
        }
      }
      await settle();
    }
  } catch (e) {
    pushLog("fail", `Runner error — ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await settle();
    restore();
    const passed = bench.results.filter((r) => r.status === "pass").length;
    const failed = bench.results.length - passed;
    setBench({ running: false, current: null, lastRunAt: stamp() });
    pushLog(
      "done",
      bench.aborted
        ? `Aborted — ${passed} passed, ${failed} failed up to that point. Your data was restored.`
        : `Done — ${passed} passed, ${failed} failed. Your data was restored.`
    );
    if (!window.location.hash.startsWith("#/app/tests")) window.location.hash = "#/app/tests";
  }
}

/* Snapshot the live ledger (memory + disk) and reset to a fresh state.
 * Returns a restore function that puts everything back. */
export function snapshotAndReset(): () => void {
  flushPersist();
  const disk = localStorage.getItem("tickkeep-v1");
  const memory = useStore.getState().exportData();
  useStore.setState(createFreshState());
  return () => {
    const err = useStore.getState().importData(JSON.parse(memory));
    if (err) {
      // last resort: raw disk restore + rehydrate
      if (disk) {
        localStorage.setItem("tickkeep-v1", disk);
        void useStore.persist.rehydrate();
      }
    }
    flushPersist();
  };
}
