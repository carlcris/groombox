import { expect, type BrowserContext, type Page } from "@playwright/test";

// Tests never reach Cloudflare (TRD §14): the Turnstile script is answered locally by a stand-in
// widget that passes, or fails like Turnstile's always-fail test key.
export async function standInForBotCheck(context: BrowserContext, outcome: "pass" | "fail") {
  const widget =
    outcome === "pass"
      ? "setTimeout(() => options.callback('e2e-bot-check-token'), 50);"
      : "setTimeout(() => options['error-callback'](), 50);";
  await context.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile = { render(container, options) { ${widget} return "e2e-widget"; }, remove() {} };`,
    }),
  );
}

// Picks services, a staff member, and the first time on the first date from the nth open date
// (counting from today) that has times, leaving the flow at the details step. Returns the chosen
// time's label. Tests that run side by side start far enough apart that they never meet.
export async function chooseSlot(
  page: Page,
  options: { services: string[]; staff: string; openDateIndex: number },
): Promise<string> {
  await expect(page.getByRole("heading", { name: "Choose services" })).toBeVisible();
  for (const service of options.services) await page.getByRole("checkbox", { name: service, exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Choose who" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`^${options.staff}`) }).click();

  await expect(page.getByRole("heading", { name: "Choose a time" })).toBeVisible();
  const openDates = page.getByRole("group", { name: "Choose a time" }).locator("button:not([disabled])");
  const firstTime = page.getByRole("button", { name: /^\d{1,2}:\d{2} (AM|PM)/ }).first();
  for (let index = options.openDateIndex; ; index += 1) {
    await openDates.nth(index).click();
    await expect(firstTime.or(page.getByText("No times left on this day"))).toBeVisible();
    if (await firstTime.isVisible()) break;
  }
  const label = (await firstTime.textContent()) ?? "";
  await firstTime.click();
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  return label;
}

export async function acceptAndHold(page: Page) {
  await expect(page.getByRole("heading", { name: "Review and hold" })).toBeVisible();
  await expect(page.getByText("Due now")).toBeVisible();
  await page.getByRole("checkbox", { name: "I accept the shop's cancellation policy" }).check();
  await page.getByRole("checkbox", { name: "I agree to the privacy notice" }).check();
  await page.getByRole("button", { name: "Hold my slot" }).click();
  await expect(page).toHaveURL(/\/booking\/[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  await expect(page.getByRole("heading", { name: "Your slot is held" })).toBeVisible();
}
