import { expect, test } from "@playwright/test";
import { seededPassword } from "./account-steps";
import { acceptAndHold, chooseSlot, standInForBotCheck } from "./booking-steps";

// Phase 3 exit criteria: a guest and a signed-in client each hold a slot from a branch link; a guest
// opens their booking from the link on a second device, takes it over, and cancels it; a stranger
// with the link sees it read-only, without the mobile number.
//
// The phone and desktop runs book different staff members or dates, so they never compete for one
// slot when they run side by side.

test("a guest holds a slot from a branch link", async ({ page, context }) => {
  const isPhone = test.info().project.name === "phone";
  await standInForBotCheck(context, "pass");

  await page.goto("/b/haven-spa-makati");
  await expect(page.getByRole("heading", { name: "Makati" })).toBeVisible();
  await expect(page.getByText("Haven Spa", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Book" }).click();

  await chooseSlot(page, { services: ["Haircut"], staff: isPhone ? "Jenny Santos" : "Carlo Reyes", openDateIndex: 2 });
  await page.getByLabel("Your name").fill("Gail Guest");
  await page.getByLabel("Mobile number").fill("0917 555 1111");
  await page.getByRole("button", { name: "Continue as guest" }).click();

  await expect(page.getByText("₱350", { exact: true }).first()).toBeVisible();
  await acceptAndHold(page);
  await expect(page.getByText("Pay ₱110.50 now. ₱250 is due at the shop.")).toBeVisible();
  await expect(page.getByText(/^\d+:\d{2} left to pay$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pay to: GCash" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Payment QR code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy booking link" })).toBeVisible();
  await expect(page.getByText("Gail Guest")).toBeVisible();
});

test("a signed-in client holds a slot, keeping their choices through sign-in", async ({ page }) => {
  const isPhone = test.info().project.name === "phone";
  await page.goto("/b/haven-spa-bgc/book");
  const time = await chooseSlot(page, { services: ["Foot spa"], staff: "Lea Ramos", openDateIndex: isPhone ? 2 : 9 });

  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in\?redirect=/);
  await page.getByLabel("Email").fill("client@groombox.test");
  await page.getByLabel("Password").fill(seededPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Bea Lim");
  await page.getByLabel("Mobile number").fill("0917 555 0303");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(time)).toBeVisible();
  await acceptAndHold(page);
  await expect(page.getByText("Pay to: Maya")).toBeVisible();

  // The client cancels the hold, so a rerun stays inside the two-hold limit.
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByRole("heading", { name: "This booking was cancelled" })).toBeVisible();
});

test("a guest takes a booking over on a second device and cancels it; a stranger sees it read-only", async ({ browser }) => {
  const isPhone = test.info().project.name === "phone";
  const firstDevice = await browser.newContext();
  await standInForBotCheck(firstDevice, "pass");
  const firstPage = await firstDevice.newPage();
  await firstPage.goto("/b/haven-spa-makati/book");
  await chooseSlot(firstPage, { services: ["Haircut"], staff: isPhone ? "Jenny Santos" : "Carlo Reyes", openDateIndex: 12 });
  await firstPage.getByLabel("Your name").fill("Gwen Guest");
  await firstPage.getByLabel("Mobile number").fill("0917 555 2222");
  await firstPage.getByRole("button", { name: "Continue as guest" }).click();
  await acceptAndHold(firstPage);
  const bookingUrl = firstPage.url();

  // A stranger with the link: read-only, with neither the client's name nor the mobile number.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(bookingUrl);
  await expect(strangerPage.getByRole("heading", { name: "Your slot is held" })).toBeVisible();
  await expect(strangerPage.getByText("You're viewing this booking from its link.")).toBeVisible();
  await expect(strangerPage.getByText("Haircut").first()).toBeVisible();
  await expect(strangerPage.getByRole("heading", { name: "Pay to: GCash" })).toBeVisible();
  await expect(strangerPage.getByRole("button", { name: "Cancel booking" })).toBeHidden();
  await expect(strangerPage.locator("body")).not.toContainText("0917 555 2222");
  await expect(strangerPage.locator("body")).not.toContainText("Gwen Guest");
  await stranger.close();

  // The guest on a second device takes it over and cancels it.
  const secondDevice = await browser.newContext();
  await standInForBotCheck(secondDevice, "pass");
  const secondPage = await secondDevice.newPage();
  await secondPage.goto(bookingUrl);
  await secondPage.getByRole("button", { name: "Manage this booking here" }).click();
  await expect(secondPage.getByText("This booking is now managed on this device.")).toBeVisible();
  await expect(secondPage.getByText("Gwen Guest")).toBeVisible();
  await secondPage.getByRole("button", { name: "Cancel booking" }).click();
  await secondPage.getByRole("dialog").getByLabel("Reason (optional)").fill("Can't make it");
  await secondPage.getByRole("dialog").getByRole("button", { name: "Cancel booking" }).click();
  await expect(secondPage.getByRole("heading", { name: "This booking was cancelled" })).toBeVisible();

  // The first device has lost the booking; it still opens read-only from the link.
  await firstPage.reload();
  await expect(firstPage.getByRole("heading", { name: "This booking was cancelled" })).toBeVisible();
  await expect(firstPage.getByRole("button", { name: "Cancel booking" })).toBeHidden();
  await expect(firstPage.getByText("You're viewing this booking from its link.")).toBeVisible();
  await secondDevice.close();
  await firstDevice.close();
});

test("a failed bot check keeps a visitor from booking as a guest", async ({ page, context }) => {
  await standInForBotCheck(context, "fail");
  await page.goto("/b/haven-spa-makati/book");
  await chooseSlot(page, { services: ["Haircut"], staff: "Any available", openDateIndex: 1 });
  await page.getByLabel("Your name").fill("Bot");
  await page.getByLabel("Mobile number").fill("0917 555 9999");
  await expect(page.getByText("We couldn't confirm you're not a bot. Reload the page and try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue as guest" })).toBeDisabled();
});

test("inside Instagram's browser, sign-in asks to open the phone's browser before Google", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 Instagram 312.0.0",
  });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await expect(page.getByText("Open this page in your browser")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Continue with Facebook" })).toBeVisible();
  await context.close();
});

test("an unpublished or unknown branch is not taking online bookings", async ({ page }) => {
  await page.goto("/b/no-such-branch");
  await expect(page.getByRole("heading", { name: "This shop is not taking online bookings" })).toBeVisible();
  await page.goto("/o/haven-spa");
  await expect(page.getByRole("link", { name: /BGC Late Night/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Makati/ })).toBeVisible();
});
