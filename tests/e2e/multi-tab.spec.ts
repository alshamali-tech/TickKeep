import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/** Two tabs on the same origin share localStorage — the persistence layer must
 *  keep them consistent, and a running timer must never be double-billed. */

async function freshTab(context: BrowserContext, url: string): Promise<Page> {
  const page: Page = await context.newPage();
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  return page;
}

test.describe("Multiple tabs", () => {
  test("a timer started in tab A is visible to tab B and bills exactly once", async ({ context }) => {
    const a = await freshTab(context, "/#/app/timer");
    await a.getByRole("button", { name: /punch in/i }).click();
    await expect(a.getByText(/on the clock/i).first()).toBeVisible();

    // Tab B sees the running timer through shared storage.
    const b = await freshTab(context, "/#/app");
    await b.waitForFunction(
      () => (localStorage.getItem("tickkeep-v1") || "").includes("activeTimer"),
      undefined,
      { timeout: 8000 }
    );

    // Stopping in A creates exactly one entry — visible to B without a reload race.
    await a.getByRole("button", { name: /punch out/i }).click();
    await a.waitForFunction(() => {
      const raw = localStorage.getItem("tickkeep-v1");
      const parsed = raw ? JSON.parse(raw) : null;
      const list = parsed?.state?.entries ?? [];
      return Array.isArray(list) && list.length >= 1;
    }, undefined, { timeout: 8000 });

    await b.reload();
    await b.goto("/#/app/entries");
    const entries = await b.evaluate(() => {
      const raw = localStorage.getItem("tickkeep-v1");
      const parsed = raw ? JSON.parse(raw) : null;
      const list = parsed?.state?.entries ?? [];
      return Array.isArray(list) ? list.length : 0;
    });
    expect(entries).toBe(1);
  });

  test("an entry written in tab A reaches tab B's storage", async ({ context }) => {
    const a = await freshTab(context, "/#/app/clients");
    await a.getByRole("button", { name: /new client/i }).click();
    await a.locator('[role="dialog"]').locator("input").first().fill("Cross Tab Co");
    await a.getByRole("button", { name: /add client/i }).click();

    const b = await freshTab(context, "/#/app");
    await b.waitForFunction(
      () => (localStorage.getItem("tickkeep-v1") || "").includes("Cross Tab Co"),
      undefined,
      { timeout: 8000 }
    );
  });
});
