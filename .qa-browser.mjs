import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";

const base = process.argv[2];
const label = process.argv[3] || "target";
const browser = await chromium.launch({ headless: true });
const report = { base, label, scans: [], desktop: {}, mobile: {}, offline: {}, privacy: {} };

async function scan(context, path) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const origins = new Set();
  page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", err => pageErrors.push(String(err)));
  page.on("request", request => origins.add(new URL(request.url()).origin));
  const response = await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const semantics = await page.evaluate(() => ({
    title: document.title,
    lang: document.documentElement.lang,
    h1: document.querySelectorAll("h1").length,
    main: document.querySelectorAll("main").length,
    missingAlt: [...document.images].filter(img => !img.hasAttribute("alt")).length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  const item = {
    path,
    status: response?.status(),
    consoleErrors,
    pageErrors,
    origins: [...origins],
    semantics,
    axeSeriousCritical: axe.violations.filter(v => ["serious", "critical"].includes(v.impact || "")).map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
  };
  await page.close();
  return item;
}

for (const colorScheme of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme });
  for (const path of ["/", "/lab", "/archive", "/field-kit", "/privacy", "/terms"]) {
    report.scans.push({ colorScheme, ...(await scan(context, path)) });
  }
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", err => pageErrors.push(String(err)));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const firstFocus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return null;
    const css = getComputedStyle(el);
    return { text: el.innerText, tag: el.tagName, outline: css.outline, rect: el.getBoundingClientRect().toJSON() };
  });
  await page.goto(base + "/lab", { waitUntil: "networkidle" });
  const initial = {
    connection: await page.locator(".connection").innerText(),
    callout: await page.locator(".state-callout").count() ? await page.locator(".state-callout").innerText() : null,
    runDisabled: await page.locator("#run").isDisabled(),
  };
  await page.locator("#prediction").fill("ab");
  const twoCharDisabled = await page.locator("#run").isDisabled();
  await page.locator("#prediction").fill("Expected 33 string because addition is left associative.");
  const validPredictionDisabled = await page.locator("#run").isDisabled();
  let result = null;
  let receipt = null;
  if (!validPredictionDisabled) {
    await page.keyboard.press("Control+Enter");
    await page.locator("#result-title").waitFor({ timeout: 10000 });
    result = await page.locator("#result").innerText();
    await page.getByLabel("Matched").check();
    await page.locator("#learner-note").fill("Plus changes after the string operand.");
    await page.locator("#save-receipt").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-download]").click();
    const download = await downloadPromise;
    const path = await download.path();
    receipt = path ? await fs.readFile(path, "utf8") : null;
    page.on("dialog", dialog => dialog.dismiss());
    await page.locator("[data-delete]").click();
    const countAfterCancel = await page.locator(".receipt-card").count();
    page.removeAllListeners("dialog");
    page.on("dialog", dialog => dialog.accept());
    await page.locator("[data-delete]").click();
    const countAfterDelete = await page.locator(".receipt-card").count();
    report.desktop.receiptDelete = { countAfterCancel, countAfterDelete };
  }
  report.desktop = { ...report.desktop, firstFocus, initial, twoCharDisabled, validPredictionDisabled, result, receiptChecks: receipt ? {
    hasRuntime: receipt.includes("Node.js 22"),
    hasPrediction: receipt.includes("Expected 33 string"),
    hasCode: receipt.includes("const value = 1 + 2"),
    hasOutput: receipt.includes("33 string"),
  } : null, consoleErrors, pageErrors };
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", err => pageErrors.push(String(err)));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.locator(".nav-toggle").click();
  const navExpanded = await page.locator(".nav-toggle").getAttribute("aria-expanded");
  await page.getByRole("link", { name: "Lab", exact: true }).click();
  await page.locator("#exercise-select").selectOption("py-alias");
  const heading = await page.locator(".specimen h2").innerText();
  const metrics = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    viewport: [innerWidth, innerHeight],
    smallTargets: [...document.querySelectorAll("a,button,input,select,textarea,summary")]
      .filter(el => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
      }).map(el => ({ tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 60), width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height) })),
  }));
  await page.screenshot({ path: `/tmp/${label}-mobile.png`, fullPage: true });
  report.mobile = { navExpanded, heading, metrics, consoleErrors, pageErrors };
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(base + "/lab", { waitUntil: "networkidle" });
  report.mobile.reducedMotion = await page.evaluate(() => {
    const animated = [...document.querySelectorAll("*")].map(el => {
      const s = getComputedStyle(el);
      return { tag: el.tagName, transition: s.transitionDuration, animation: s.animationDuration, scroll: s.scrollBehavior };
    }).filter(x => x.transition !== "0s" || x.animation !== "0s" || x.scroll === "smooth");
    return { mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches, animated: animated.slice(0, 20) };
  });
  await context.close();
}

{
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", err => pageErrors.push(String(err)));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
  const before = await page.evaluate(async () => ({ controller: !!navigator.serviceWorker.controller, keys: await caches.keys(), entries: Object.fromEntries(await Promise.all((await caches.keys()).map(async key => [key, (await caches.open(key).then(c => c.keys())).map(r => new URL(r.url).pathname)]))) }));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.clearBrowserCache");
  await context.setOffline(true);
  let reloadError = null;
  try { await page.reload({ waitUntil: "load", timeout: 15000 }); } catch (error) { reloadError = String(error); }
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => ({ title: document.title, h1: document.querySelectorAll("h1").length, main: document.querySelectorAll("main").length, textLength: document.body.innerText.trim().length })).catch(error => ({ evaluateError: String(error) }));
  report.offline = { before, reloadError, after, consoleErrors, pageErrors };
  await context.close();
}

{
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [];
  page.on("request", request => requests.push(request.url()));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const normal = await page.evaluate(() => ({ localStorage: Object.keys(localStorage), cookies: document.cookie }));
  const external = requests.filter(url => new URL(url).origin !== new URL(base).origin);
  await page.goto(base + "/?license=qa-invalid-token", { waitUntil: "networkidle" });
  const license = await page.evaluate(() => ({ path: location.pathname + location.search, tokenStored: localStorage.getItem("sb_license:code-prediction-lab") === "qa-invalid-token", cache: localStorage.getItem("sb_license:code-prediction-lab:verdict") }));
  report.privacy = { normal, external, license, allOrigins: [...new Set(requests.map(url => new URL(url).origin))] };
  await context.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
