import { test, expect } from "@playwright/test";

/** PDF generation must work from a cold start: seed the minimum ledger through
 *  the UI, run the invoice wizard, and assert a real file downloads. */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("invoice wizard → PDF download", async ({ page }) => {
  // client
  await page.goto("/#/app/clients");
  await page.getByRole("button", { name: /new client/i }).click();
  await page.locator('[role="dialog"]').locator("input").first().fill("PDF Client");
  await page.getByRole("button", { name: /add client/i }).click();
  await expect(page.getByText("PDF Client").first()).toBeVisible();

  // project
  await page.goto("/#/app/projects");
  await page.getByRole("button", { name: /new project/i }).click();
  await page.locator('[role="dialog"]').locator('input:not([type])').first().fill("PDF Project");
  await page.getByRole("button", { name: /create project|add project/i }).click();
  await expect(page.getByText("PDF Project").first()).toBeVisible();

  // one billable entry
  await page.goto("/#/app/entries");
  await page.getByRole("button", { name: /new entry/i }).click();
  const dlg = page.locator('[role="dialog"]');
  await dlg.locator('input:not([type])').first().fill("PDF billable work");
  await dlg.locator('input[placeholder*="1:30"]').fill("2:00");
  await page.getByRole("button", { name: /save entry/i }).click();
  await expect(page.getByText("PDF billable work").first()).toBeVisible();

  // wizard → draft
  await page.goto("/#/app/invoices");
  await page.getByRole("button", { name: /new invoice/i }).click();
  await page.locator('[role="dialog"] [role="checkbox"]').first().click();
  await page.getByRole("button", { name: /create draft/i }).click();

  // detail → PDF download (jsPDF chunk loads on demand — generous timeout)
  await expect(page.getByText(/total due/i).first()).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: "PDF", exact: true }).first().click(),
  ]);
  expect(download.suggestedName()).toMatch(/^INV-\d+\.pdf$/);
});
