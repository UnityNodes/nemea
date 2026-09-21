import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../../../docs/screenshots");
const baseUrl = (process.env.BASE_URL ?? "").replace(/\/$/, "");
const addSymbol = process.env.ADD_SYMBOL ?? "LINK";
const colorScheme = process.env.COLOR_SCHEME === "dark" ? "dark" : "light";
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const TIMEOUT = 60_000;

if (process.env.CONFIRM_REAL_DATA !== "1") {
  console.error(
    [
      "Refusing to run: README screenshots must show real CoinMarketCap data.",
      "Point BASE_URL at a stack that talks to the real CoinMarketCap API (not the development fake),",
      "then run again with CONFIRM_REAL_DATA=1.",
    ].join("\n"),
  );
  process.exit(1);
}

if (!baseUrl) {
  console.error("BASE_URL is required, for example BASE_URL=http://localhost:3000");
  process.exit(1);
}

const viewports = [
  { name: "1280", options: { viewport: { width: 1280, height: 800 } } },
  { name: "390", options: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];

async function revealEverything(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
}

async function shoot(page, file, options = {}) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const target = path.join(outDir, file);
  if (options.locator) await options.locator.screenshot({ path: target });
  else await page.screenshot({ path: target, fullPage: options.fullPage ?? true });
  console.log(`wrote ${target}`);
}

async function walk(browser, viewport) {
  const context = await browser.newContext({ ...viewport.options, colorScheme, baseURL: baseUrl });
  context.setDefaultTimeout(TIMEOUT);
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("status of 401")) problems.push(`console error: ${message.text()}`);
  });
  const wanted = (name) => !only || only.has(name);

  await page.goto("/");
  await page.getByRole("button", { name: /Start as guest/ }).first().waitFor();
  await page.waitForTimeout(800);
  await revealEverything(page);
  if (wanted("landing")) await shoot(page, `landing-${viewport.name}.png`);

  await page.getByRole("button", { name: /Start as guest/ }).first().click();
  await page.waitForURL("**/app");
  await page.getByRole("button", { name: "Load a sample portfolio" }).click();
  await page.getByRole("button", { name: "Add a coin" }).first().waitFor();
  await page.waitForTimeout(1500);

  await page.getByRole("button", { name: "Add a coin" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Coin symbol").fill(addSymbol);
  await dialog.getByRole("button", { name: "Find" }).click();
  await dialog.getByRole("radio").first().waitFor();
  await dialog.getByRole("radio").first().check();
  await dialog.getByLabel("How many do you hold?").fill("40");
  await dialog.getByRole("button", { name: "Add to my portfolio" }).click();
  await dialog.waitFor({ state: "hidden" });

  await page.getByRole("button", { name: /Price drop/ }).click();
  await page.getByText("Simulated alert created").waitFor();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Portfolio drop/ }).click();
  await page.waitForTimeout(1500);
  await page.waitForLoadState("networkidle");
  if (wanted("dashboard")) await shoot(page, `dashboard-${viewport.name}.png`);

  await page.getByRole("link", { name: "Explain like I'm 5", exact: true }).first().click();
  await page.waitForURL("**/alerts/**");
  await page.getByRole("button", { name: "Explain like I'm 5", exact: true }).click();
  await page.getByText("What we couldn't check").waitFor();
  await page.waitForTimeout(2400);
  if (wanted("alert")) await shoot(page, `alert-eli5-${viewport.name}.png`);

  const raise = page.getByRole("button", { name: "Raise protection to level 2" });
  if (await raise.isVisible().catch(() => false)) await raise.click();
  await page.getByRole("link", { name: /Open in Uniswap/ }).first().waitFor();
  await page.waitForTimeout(600);
  if (wanted("protect")) await shoot(page, `protect-${viewport.name}.png`, { locator: page.locator("#protect") });

  await page.goto("/status");
  await page.getByRole("heading", { name: "Live CoinMarketCap calls" }).waitFor();
  await page.waitForTimeout(1200);
  await revealEverything(page);
  if (wanted("status")) await shoot(page, `status-${viewport.name}.png`);

  await context.close();
  return problems;
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failed = false;
try {
  for (const viewport of viewports) {
    const problems = await walk(browser, viewport);
    for (const problem of problems) console.warn(`[${viewport.name}] ${problem}`);
    if (problems.length > 0) failed = true;
  }
} finally {
  await browser.close();
}

if (failed) {
  console.error("Finished with browser errors. Review the messages above before publishing these screenshots.");
  process.exit(2);
}
console.log(`Done. Screenshots are in ${outDir}`);
