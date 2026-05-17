import { chromium } from "@playwright/test";

const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
const consoleErrors = [];

page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});

page.on("pageerror", (error) => {
  consoleErrors.push(error.message);
});

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.screenshot({ path: ".data/browser-home.png", fullPage: true });

const bodyText = await page.locator("body").innerText();
if (!bodyText.includes("Table Agent") || !bodyText.includes("Find tables")) {
  throw new Error("Home page did not render expected app content.");
}

await page.getByRole("button", { name: /Find tables/i }).click();
await page.getByRole("button", { name: /Execute booking plan/i }).waitFor({ timeout: 120000 });

const optionCount = await page.locator(".restaurant-row").count();
if (optionCount < 1) {
  throw new Error("Search did not render restaurant options.");
}

if (process.env.VERIFY_LIVE_BOOKING === "true") {
  await page.getByRole("button", { name: /Execute booking plan/i }).click();
  await page.locator(".booking-result code").waitFor({ timeout: 30000 });
}
await page.screenshot({ path: ".data/browser-booking.png", fullPage: true });

const overlay = await page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count();
if (overlay > 0) {
  throw new Error("Framework error overlay detected.");
}

if (consoleErrors.length > 0) {
  throw new Error(`Console/page errors detected:\n${consoleErrors.join("\n")}`);
}

await browser.close();
console.log(`Browser verified at ${baseUrl}. Options rendered: ${optionCount}`);
