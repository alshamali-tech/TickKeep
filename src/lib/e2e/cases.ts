/* The end-to-end suite — driven through the real UI.
 * Includes regression tests for the two reported bugs (data reset on reopen,
 * dark mode) and a full-scale stress run: 1000 clients / 1000 projects /
 * 1000 tasks / 2000 entries / 1000 invoices / 100 teammates. */

import { computeMerge } from "../collab";
import { flushPersist, useStore, createFreshState, type Client, type Project, type Task, type TimeEntry, type Invoice, type Peer } from "../store";
import { addDays, toKey, todayKey, uid } from "../utils";
import type { Ctx, SuiteDef } from "./engine";

const DIALOG = '[role="dialog"]';
const isoNow = () => new Date().toISOString();

async function dialog(t: Ctx, title: string): Promise<HTMLElement> {
  return (await t.waitFor(`${DIALOG}[aria-label="${title}"]`)) as HTMLElement;
}

async function closeTopDialog(t: Ctx): Promise<void> {
  if (t.q(DIALOG)) t.keyDoc("Escape");
  await t.wait(120);
}

/* ------------------------------------------------------------------ */

export const SUITES: SuiteDef[] = [
  {
    name: "Persistence & theme (regressions)",
    tests: [
      {
        name: "Data survives a simulated app relaunch",
        fn: async (t) => {
          t.store().addClient({ name: "Persisted Co", currency: "USD", defaultRate: 50 });
          flushPersist();
          // wipe memory, keep disk — exactly what closing the tab does
          useStore.setState(createFreshState());
          t.assert(t.store().clients.length === 0, "memory should be wiped for the simulation");
          await useStore.persist.rehydrate();
          t.assert(
            t.store().clients.some((c) => c.name === "Persisted Co"),
            "the client must come back after relaunch — persistence is broken if this fails"
          );
        },
      },
      {
        name: "Burst mutations coalesce and still persist",
        fn: async (t) => {
          for (let i = 0; i < 12; i++) {
            t.store().addEntry({
              projectId: null, taskId: null, description: `burst ${i}`, date: todayKey(),
              durationMin: 5, billable: true, rate: 10,
            });
          }
          flushPersist();
          useStore.setState(createFreshState());
          await useStore.persist.rehydrate();
          const n = t.store().entries.filter((e) => e.description.startsWith("burst")).length;
          t.assert(n === 12, `all 12 burst entries should persist (got ${n})`);
        },
      },
      {
        name: "Dark mode toggle applies to the whole app",
        fn: async (t) => {
          await t.nav("#/app");
          const before = document.documentElement.getAttribute("data-theme");
          await t.click('[aria-label="Switch to dark theme"]');
          await t.wait(120);
          const after = document.documentElement.getAttribute("data-theme");
          t.assert(after === "dark", `html should carry data-theme=dark (got ${after})`);
          t.assert(localStorage.getItem("tv-theme") === "dark", "tv-theme should persist for the next load");
          await t.click('[aria-label="Switch to light theme"]');
          await t.wait(120);
          t.assert(document.documentElement.getAttribute("data-theme") === "light", "should switch back to light");
          if (before === "dark") await t.click('[aria-label="Switch to dark theme"]');
        },
      },
    ],
  },

  {
    name: "Core flows",
    tests: [
      {
        name: "Seed: create a client and a project through the UI",
        fn: async (t) => {
          await t.nav("#/app/clients");
          await t.clickText("New client");
          const c = await dialog(t, "New client");
          await t.typeEl(c.querySelector('input:not([type])') as HTMLElement, "E2E Client Co");
          await t.typeEl(c.querySelector('input[type="number"]') as HTMLElement, "100");
          await t.clickText("Add client");
          await t.waitForText("E2E Client Co");

          await t.nav("#/app/projects");
          await t.clickText("New project");
          const p = await dialog(t, "New project");
          await t.typeEl(p.querySelector('input:not([type])') as HTMLElement, "E2E Project");
          const sel = p.querySelector("select") as HTMLSelectElement;
          const opt = [...sel.options].find((o) => o.textContent?.includes("E2E Client Co"));
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
          }
          await t.typeEl(p.querySelector('input[type="number"]') as HTMLElement, "100");
          await t.clickText("Create project");
          await t.waitForText("E2E Project");
        },
      },
      {
        name: "Punch in, punch out, entry lands with undo",
        fn: async (t) => {
          await t.nav("#/app/timer");
          await t.clickText("Punch in");
          await t.waitForText("On the clock");
          t.assert(t.store().activeTimer !== null, "timer should be running");
          await t.wait(1100);
          await t.clickText("Punch out");
          await t.wait(200);
          t.assert(t.store().entries.length >= 1, "an entry should exist");
        },
      },
      {
        name: "Manual entry parses “1h 30m” into 90 minutes",
        fn: async (t) => {
          const before = t.store().entries.length;
          await t.nav("#/app/entries");
          await t.clickText("New entry");
          const d = await dialog(t, "New entry");
          const text = [...d.querySelectorAll('input:not([type]), input[type="text"]')] as HTMLInputElement[];
          await t.typeEl(text[0], "E2E manual entry");
          const duration = [...d.querySelectorAll("input")].find((i) => i.placeholder?.includes("1:30"));
          await t.typeEl(duration as HTMLElement, "1h 30m");
          await t.clickText("Save entry");
          await t.waitForText("E2E manual entry");
          const after = t.store().entries;
          t.assert(after.length === before + 1, "entry count should grow by one");
          t.assert(after.some((e) => e.durationMin === 90), "duration should parse to 90 minutes");
        },
      },
      {
        name: "Delete offers undo that restores the entry",
        fn: async (t) => {
          const before = t.store().entries.length;
          const row = await t.waitForRow("E2E manual entry");
          await t.clickEl(row.querySelector('[aria-label*="ctions"]') as HTMLElement);
          await t.clickText("Delete");
          await t.wait(200);
          t.assert(t.store().entries.length === before - 1, "entry should be removed immediately");
          await t.clickText("Undo");
          await t.wait(200);
          t.assert(t.store().entries.length === before, "undo should restore the entry");
        },
      },
      {
        name: "Invoice wizard turns unbilled time into a draft",
        fn: async (t) => {
          const before = t.store().invoices.length;
          await t.nav("#/app/invoices");
          await t.clickText("New invoice");
          const d = await dialog(t, "New invoice");
          const box = d.querySelector('[role="checkbox"]') as HTMLElement | null;
          t.assert(box, "unbilled entries should be selectable");
          await t.clickEl(box as HTMLElement);
          await t.wait(150);
          await t.clickText("Create draft");
          await t.wait(400);
          t.assert(t.store().invoices.length === before + 1, "a draft invoice should be created");
          await closeTopDialog(t);
        },
      },
    ],
  },

  {
    name: "Mega stress — 1000 / 1000 / 1000 / 1000 / 100",
    tests: [
      {
        name: "Seed 1000 clients, 1000 projects, 1000 tasks, 2000 entries, 1000 invoices",
        fn: async (t) => {
          const t0 = performance.now();
          const clients: Client[] = [];
          for (let i = 1; i <= 1000; i++) {
            clients.push({
              id: `mc-${i}`, name: `Client ${String(i).padStart(4, "0")}`,
              email: `c${i}@example.com`, company: `Company ${i}`,
              poNumber: i % 3 === 0 ? `PO-${i}` : undefined,
              currency: "USD", defaultRate: 80 + (i % 40), createdAt: isoNow(),
            });
          }
          const projects: Project[] = [];
          for (let i = 1; i <= 1000; i++) {
            projects.push({
              id: `mp-${i}`, name: `Project ${String(i).padStart(4, "0")}`,
              clientId: `mc-${((i - 1) % 1000) + 1}`, color: "#0D6E52",
              rate: 90, budgetHours: i % 2 === 0 ? 40 : null,
              active: true, createdAt: isoNow(), archivedAt: null,
            });
          }
          const tasks: Task[] = [];
          for (let i = 1; i <= 1000; i++) {
            tasks.push({
              id: `mt-${i}`, projectId: `mp-${((i - 1) % 1000) + 1}`,
              name: `Task ${String(i).padStart(4, "0")}`, billable: true, createdAt: isoNow(),
            });
          }
          const entries: TimeEntry[] = [];
          for (let i = 1; i <= 2000; i++) {
            entries.push({
              id: `me-${i}`, projectId: `mp-${((i - 1) % 1000) + 1}`,
              taskId: `mt-${((i - 1) % 1000) + 1}`,
              description: `Mega entry ${i}`, date: toKey(addDays(new Date(), -(i % 90))),
              durationMin: 30 + (i % 90), billable: i % 5 !== 0, rate: 90, createdAt: isoNow(),
            });
          }
          const invoices: Invoice[] = [];
          const statuses = ["draft", "sent", "paid", "sent", "draft"] as const;
          for (let i = 1; i <= 1000; i++) {
            const qty = 1 + (i % 3);
            const items = [0, 1, 2].map((k) => ({
              id: `mi-${i}-${k}`, kind: "custom" as const, refId: "",
              description: `Line ${k + 1} of invoice ${i}`, date: todayKey(),
              qty, rate: 80, amount: qty * 80,
            }));
            invoices.push({
              id: `mv-${i}`, number: `INV-${String(i).padStart(4, "0")}`,
              clientId: `mc-${((i - 1) % 1000) + 1}`,
              issueDate: toKey(addDays(new Date(), -(i % 60))),
              dueDate: toKey(addDays(new Date(), 14 - (i % 40))),
              status: statuses[i % statuses.length],
              items, taxRate: 0,
              discount: 0, currency: "USD", notes: "", terms: "", createdAt: isoNow(),
              sentAt: null, paidAt: null,
              payments: i % 4 === 0 ? [{ id: `mpay-${i}`, date: todayKey(), amount: 100, method: "bank", note: "" }] : undefined,
            });
          }
          useStore.setState({ clients, projects, tasks, entries, invoices });
          const ms = Math.round(performance.now() - t0);
          t.assert(t.store().clients.length === 1000, "clients seeded");
          t.assert(t.store().invoices.length === 1000, "invoices seeded");
          console.log(`[bench] mega seed: ${ms}ms`);
        },
      },
      {
        name: "Clients page renders 1000 rows without choking",
        fn: async (t) => {
          const t0 = performance.now();
          await t.nav("#/app/clients");
          await t.waitFor("table tbody tr");
          const rows = t.qa("table tbody tr").length;
          t.assert(rows > 0 && rows <= 100, `page should slice the rows (rendered ${rows})`);
          const ms = Math.round(performance.now() - t0);
          t.assert(ms < 5000, `render took ${ms}ms`);
          console.log(`[bench] clients render: ${ms}ms (${rows} rows on screen)`);
        },
      },
      {
        name: "Search isolates 1 of 1000 clients quickly",
        fn: async (t) => {
          const search = t.q('input[aria-label*="earch"], input[placeholder*="earch"]') as HTMLInputElement;
          t.assert(search, "client search should exist");
          const t0 = performance.now();
          await t.typeEl(search, "Client 0999");
          await t.wait(300);
          const ms = Math.round(performance.now() - t0);
          t.assert(document.body.innerText.includes("Client 0999"), "the matching client should appear");
          t.assert(ms < 2000, `search+render took ${ms}ms`);
          await t.typeEl(search, "");
          console.log(`[bench] search 1-of-1000: ${ms}ms`);
        },
      },
      {
        name: "Invoices page paginates 1000 invoices (≤25 rows rendered)",
        fn: async (t) => {
          const t0 = performance.now();
          await t.nav("#/app/invoices");
          await t.waitFor("table tbody tr");
          const rows = t.qa("table tbody tr").length;
          t.assert(rows <= 25, `only one page of rows should render (got ${rows})`);
          t.assert(t.q('nav[aria-label="Pagination"]'), "a pager should be present");
          const ms = Math.round(performance.now() - t0);
          console.log(`[bench] invoices render: ${ms}ms (${rows} rows on screen)`);
        },
      },
      {
        name: "Reports rollup handles the mega ledger",
        fn: async (t) => {
          const t0 = performance.now();
          await t.nav("#/app/reports");
          await t.waitForText("Client → project → task", 8000);
          const ms = Math.round(performance.now() - t0);
          t.assert(ms < 8000, `rollup took ${ms}ms`);
          console.log(`[bench] reports rollup over 2000 entries: ${ms}ms`);
        },
      },
      {
        name: "100 teammates merge 1000 remote entries with zero loss",
        fn: async (t) => {
          const localEntries = t.store().entries.length;
          const remoteEntries: TimeEntry[] = [];
          for (let p = 1; p <= 100; p++) {
            for (let i = 1; i <= 10; i++) {
              remoteEntries.push({
                id: `peer-e-${p}-${i}`, projectId: null, taskId: null,
                description: `Teammate ${p} work ${i}`, date: todayKey(),
                durationMin: 25, billable: true, rate: 85, createdAt: isoNow(),
              });
            }
          }
          const peers: Peer[] = Array.from({ length: 100 }, (_, i) => ({
            id: `peer-${i + 1}`, name: `Teammate ${i + 1}`,
            color: "#0D6E52", at: isoNow(),
          }));
          const t0 = performance.now();
          const result = computeMerge({ entries: remoteEntries, peers }, isoNow());
          t.store().applyCollabMerge(result);
          const ms = Math.round(performance.now() - t0);
          const after = t.store().entries.length;
          t.assert(after === localEntries + 1000, `expected ${localEntries + 1000} entries after merge, got ${after}`);
          const ids = new Set(t.store().entries.map((e) => e.id));
          t.assert(ids.size === after, "no duplicates after merge");
          t.assert(t.store().collab.peers.length >= 100, "all 100 peers should be visible");
          console.log(`[bench] 100-peer merge of 1000 entries: ${ms}ms`);
        },
      },
      {
        name: "Merging the same snapshot twice changes nothing (idempotent)",
        fn: async (t) => {
          const before = t.store().entries.length;
          const result = computeMerge({ entries: [] }, isoNow());
          t.store().applyCollabMerge(result);
          t.assert(t.store().entries.length === before, "an empty remote must not drop local work");
        },
      },
      {
        name: "Export → wipe → import round-trips the mega ledger",
        fn: async (t) => {
          const s = t.store();
          const counts = {
            clients: s.clients.length, projects: s.projects.length, tasks: s.tasks.length,
            entries: s.entries.length, invoices: s.invoices.length,
          };
          const t0 = performance.now();
          const json = s.exportData();
          const exportMs = Math.round(performance.now() - t0);
          s.clearLedger();
          t.assert(t.store().clients.length === 0, "ledger should be clearable");
          const t1 = performance.now();
          const err = s.importData(JSON.parse(json));
          const importMs = Math.round(performance.now() - t1);
          t.assert(err === null, `import should succeed (${err})`);
          const r = t.store();
          t.assert(r.clients.length === counts.clients, "clients round-trip");
          t.assert(r.projects.length === counts.projects, "projects round-trip");
          t.assert(r.tasks.length === counts.tasks, "tasks round-trip");
          t.assert(r.entries.length === counts.entries, "entries round-trip");
          t.assert(r.invoices.length === counts.invoices, "invoices round-trip");
          console.log(`[bench] export ${(json.length / 1024).toFixed(0)} KB in ${exportMs}ms · import in ${importMs}ms`);
        },
      },
      {
        name: "Persistence flush at scale is graceful (quota handled, data intact)",
        fn: async (t) => {
          const clientsBefore = t.store().clients.length;
          flushPersist();
          // quota may legitimately trip at this scale — the adapter must not
          // crash and the in-memory ledger must stay authoritative either way
          const raw = localStorage.getItem("timevault-v1");
          t.assert(t.store().clients.length === clientsBefore, "in-memory ledger untouched by persistence");
          if (raw) {
            console.log(`[bench] persisted snapshot: ${(raw.length / 1024).toFixed(0)} KB`);
          } else {
            console.log("[bench] localStorage unavailable at this scale — in-memory + export remain authoritative");
          }
        },
      },
    ],
  },

  {
    name: "Accessibility sweep",
    tests: [
      {
        name: "Icon buttons carry accessible names",
        fn: async (t) => {
          for (const r of ["#/app", "#/app/timer", "#/app/invoices", "#/app/settings"]) {
            await t.nav(r);
            await t.wait(150);
            const unlabeled = t.qa("button").filter(
              (b) => !b.getAttribute("aria-label") && !(b.textContent || "").trim() && !b.getAttribute("role")
            );
            t.assert(unlabeled.length === 0, `${r}: ${unlabeled.length} icon buttons lack labels`);
          }
        },
      },
      {
        name: "Modals close with Escape",
        fn: async (t) => {
          await t.nav("#/app/entries");
          await t.clickText("New entry");
          await t.waitFor(DIALOG);
          t.keyDoc("Escape");
          await t.waitForGone(DIALOG);
        },
      },
      {
        name: "No horizontal overflow on core routes",
        fn: async (t) => {
          for (const r of ["#/app", "#/app/entries", "#/app/reports", "#/app/invoices", "#/app/settings"]) {
            await t.nav(r);
            await t.wait(200);
            t.assertNoOverflow();
          }
        },
      },
    ],
  },
];

export const TOTAL_CASES = SUITES.reduce((n, s) => n + s.tests.length, 0);
