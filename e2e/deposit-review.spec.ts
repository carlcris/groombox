import { expect, test, type Browser, type Page } from "@playwright/test";
import { signIn } from "./account-steps";
import { acceptAndHold, chooseSlot, standInForBotCheck } from "./booking-steps";

// Phase 4 exit criteria: the full path works (hold, pay, report, accept, confirmed) with both sides
// updating live; resubmission and rejection work, and a refund is recorded. Hold expiry, review
// expiry, and the single fee entry are covered by supabase/tests/deposits.test.sql, which can move
// the clock.
//
// The phone and desktop runs book different staff members, and each reviewer finds its own client
// by name, so the runs can share the owner's deposit list.

const havenMakatiBranchId = "30000000-0000-0000-0000-000000000001";

// A 1 × 1 PNG, standing in for a payment screenshot.
const screenshot = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
  "base64",
);

async function guestHoldsSlot(browser: Browser, clientName: string, openDateIndex: number): Promise<Page> {
  const context = await browser.newContext();
  await standInForBotCheck(context, "pass");
  const page = await context.newPage();
  await page.goto("/b/haven-spa-makati/book");
  const isPhone = test.info().project.name === "phone";
  await chooseSlot(page, { services: ["Haircut"], staff: isPhone ? "Jenny Santos" : "Carlo Reyes", openDateIndex });
  await page.getByLabel("Your name").fill(clientName);
  await page.getByLabel("Mobile number").fill("0917 555 4444");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await acceptAndHold(page);
  return page;
}

async function reportPayment(page: Page, reference: string, amount?: string) {
  await page.getByLabel("Reference number").fill(reference);
  if (amount) await page.getByLabel("Amount paid (₱)").fill(amount);
  await page.getByRole("button", { name: "Report payment" }).click();
  await expect(page.getByRole("heading", { name: "Payment under review" })).toBeVisible();
}

async function openReviewerDeposits(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, "owner@haven.test");
  await expect(page).toHaveURL(/\/shop\//);
  await page.goto(`/shop/${havenMakatiBranchId}/deposits`);
  await expect(page.getByRole("heading", { name: "Deposits" })).toBeVisible();
  return page;
}

test("a reported payment is reviewed, resubmitted, and accepted, with both sides updating live", async ({ browser }) => {
  const clientName = `Pia Payer ${test.info().project.name}`;
  const client = await guestHoldsSlot(browser, clientName, 6);
  const reviewer = await openReviewerDeposits(browser);

  // The client reports a short payment with a screenshot; it appears on the reviewer's list live.
  await client.getByRole("button", { name: "Add screenshot" }).click();
  await client.locator('input[type="file"]').setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: screenshot });
  await expect(client.getByText("Screenshot added: receipt.png")).toBeVisible();
  await reportPayment(client, "GC-E2E-001", "100");
  await expect(client.getByText("₱100 · GCash · GC-E2E-001")).toBeVisible();

  const review = reviewer.getByRole("button", { name: `Review payment: ${clientName}` });
  await expect(review).toBeVisible();
  await review.click();
  const sheet = reviewer.getByRole("dialog");
  await expect(sheet.getByText("₱10.50 short")).toBeVisible();
  await expect(sheet.getByRole("img", { name: "Payment screenshot" })).toBeVisible();
  await sheet.getByRole("button", { name: "Ask to resubmit" }).click();
  await sheet.getByRole("button", { name: "Ask to resubmit" }).click();
  await expect(sheet.getByText("Tell the client what to fix.")).toBeVisible();
  await sheet.getByLabel("Note to the client").fill("We received ₱100. Please send the remaining ₱10.50.");
  await sheet.getByRole("button", { name: "Ask to resubmit" }).click();
  await expect(sheet).toBeHidden();

  // The client's page changes on its own, with the shop's note, and they report again.
  await expect(client.getByRole("heading", { name: "The shop asked you to send your payment details again" })).toBeVisible();
  await expect(client.getByText("We received ₱100. Please send the remaining ₱10.50.")).toBeVisible();
  await reportPayment(client, "GC-E2E-002");

  await expect(review).toBeVisible();
  await review.click();
  await expect(reviewer.getByRole("dialog").getByText("₱10.50 short")).toBeHidden();
  await reviewer.getByRole("dialog").getByRole("button", { name: "Accept" }).click();
  await expect(reviewer.getByText("Payment accepted")).toBeVisible();
  await expect(review).toBeHidden();

  await expect(client.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
  await client.context().close();
  await reviewer.context().close();
});

test("a rejected payment releases the booking, and the refund is recorded", async ({ browser }) => {
  const clientName = `Rory Rejected ${test.info().project.name}`;
  const client = await guestHoldsSlot(browser, clientName, 8);
  await reportPayment(client, "GC-E2E-404");

  const reviewer = await openReviewerDeposits(browser);
  await reviewer.getByRole("button", { name: `Review payment: ${clientName}` }).click();
  const sheet = reviewer.getByRole("dialog");
  await sheet.getByRole("button", { name: "Reject" }).click();
  await sheet.getByLabel("Note to the client").fill("No payment with this reference reached us.");
  await sheet.getByRole("button", { name: "Reject" }).click();
  await expect(sheet).toBeHidden();

  await expect(client.getByRole("heading", { name: "Payment not accepted" })).toBeVisible();
  await expect(client.getByText("No payment with this reference reached us.")).toBeVisible();

  await reviewer.getByRole("button", { name: `Record refund: ${clientName}` }).click();
  const refundSheet = reviewer.getByRole("dialog");
  await refundSheet.getByLabel("Amount refunded (₱)").fill("110.50");
  await refundSheet.getByRole("button", { name: "Record refund" }).click();
  await expect(reviewer.getByText("Refund recorded")).toBeVisible();
  await expect(reviewer.getByRole("button", { name: `Record refund: ${clientName}` })).toBeHidden();
  await client.context().close();
  await reviewer.context().close();
});
