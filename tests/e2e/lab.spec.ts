import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("prediction gate, isolated run, and local receipt work end to end", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/lab");
  await expect(page.locator("h1")).toHaveCount(1);
  const run = page.getByRole("button", { name: /Record a prediction to run/ });
  await expect(run).toBeDisabled();
  await page.getByLabel("Write the exact output and your reason").fill("33, then string, because the final + concatenates.");
  await expect(page.getByRole("button", { name: /Run the specimen/ })).toBeEnabled();
  await page.getByRole("button", { name: /Run the specimen/ }).click();
  await expect(page.getByRole("heading", { name: "Observed output" })).toBeVisible();
  await expect(page.locator("#result pre")).toContainText("33 string");
  await page.getByLabel("Matched").check();
  await page.getByLabel("What will you remember next time?").fill("Plus evaluates from the left.");
  await page.getByRole("button", { name: /Save field note/ }).click();
  await expect(page).toHaveURL(/\/archive$/);
  await expect(page.getByRole("heading", { name: "The plus sign changes its mind" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("home and lab have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/", "/lab", "/privacy", "/terms"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter(item => ["serious", "critical"].includes(item.impact || "")), `${path}: ${JSON.stringify(results.violations)}`).toEqual([]);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);
  }
});

test("mobile navigation and lab picker remain operable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only check");
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "Lab", exact: true }).click();
  await expect(page.getByLabel("Choose a specimen")).toBeVisible();
  await page.getByLabel("Choose a specimen").selectOption("py-alias");
  await expect(page.getByRole("heading", { name: "Two labels, one list" })).toBeVisible();
});
