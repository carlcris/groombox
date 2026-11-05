import { expect, test, type Page } from "@playwright/test";
import { addServiceAndStaff, createOwnerWithShop, publishNewShop } from "./account-steps";
import { acceptAndHold, chooseSlot, standInForBotCheck } from "./booking-steps";

// Phase 6 exit criteria: checkout with a discount, a tip, and split payments that must add up to the
// balance; a deposit larger than the final bill leaves a zero balance and shows the refund due; a
// closed day rejects new sales until it is reopened. The hand-calculated day, the after-midnight
// checkout, rounding, and commission rates are covered in supabase/tests/checkout_and_daily_close.test.sql.
//
// Each test builds its own shop, so reruns and the phone and desktop runs never share a day.

async function startWalkIn(page: Page, branchId: string, clientName: string, serviceName: string, staffName: string) {
  await page.goto(`/shop/${branchId}/floor`);
  await page.getByRole("button", { name: "Add walk-in" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "New client" }).click();
  await sheet.getByLabel("Client name").fill(clientName);
  await sheet.getByRole("checkbox", { name: new RegExp(`^${serviceName}`) }).check();
  await sheet.getByRole("button", { name: "Add to queue" }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole("listitem", { name: clientName }).getByRole("button", { name: "Start" }).click();
  const start = page.getByRole("dialog");
  await start.getByLabel("Staff member").click();
  await page.getByRole("option", { name: staffName }).click();
  await start.getByRole("button", { name: "Start" }).click();
  await expect(start).toBeHidden();
  if (test.info().project.name === "phone") await page.getByRole("tab", { name: /^In service/ }).click();
  await page.getByRole("listitem", { name: clientName }).getByRole("link", { name: "Checkout" }).click();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
}

test("a walk-in is checked out with split payments, the day closes, and a closed day takes no sales until reopened", async ({ page }) => {
  const { branchId } = await createOwnerWithShop(page, `Tala Salon ${test.info().project.name} ${Date.now()}`, "Kapitolyo");
  await addServiceAndStaff(page, "Trim", "Oscar Diaz");
  // A second staff member, for the walk-in that arrives while Oscar's first visit still holds his time.
  await page.getByRole("button", { name: "Add staff member" }).click();
  const staffSheet = page.getByRole("dialog");
  await staffSheet.getByLabel("Name shown to clients").fill("Pia Diaz");
  await staffSheet.getByRole("checkbox", { name: "Trim" }).check();
  await staffSheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Pia Diaz", { exact: true })).toBeVisible();
  await page.goto(`/shop/${branchId}/setup`);
  await page.getByRole("checkbox", { name: "Trim" }).click();
  await expect(page.getByRole("checkbox", { name: "Trim" })).toBeChecked();

  // ₱400 trim, ₱50 off, ₱20 tip: ₱370, paid ₱300 in cash and ₱70 by GCash.
  await startWalkIn(page, branchId, "Cora Cash", "Trim", "Oscar Diaz");
  await expect(page.getByLabel("Price (₱)")).toHaveValue("400.00");
  await page.getByLabel("Discount (₱)").fill("50");
  await page.getByLabel("Tip for Oscar Diaz (₱)").fill("20");
  await expect(page.getByText("₱370").first()).toBeVisible();
  await page.getByRole("button", { name: "Add payment" }).click();
  await expect(page.getByLabel("Amount (₱)")).toHaveValue("370.00");
  await page.getByLabel("Amount (₱)").fill("300");
  await page.getByLabel("Cash received (₱)").fill("500");
  await expect(page.getByText("Change: ₱200")).toBeVisible();
  await expect(page.getByText("₱70 left to record")).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete" })).toBeDisabled();
  await page.getByRole("button", { name: "Add payment" }).click();
  await expect(page.getByText("Payments match the balance.")).toBeVisible();
  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByRole("heading", { name: "Sale" })).toBeVisible();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();

  // The close: ₱400 gross, ₱300 cash, ₱70 GCash; a ₱500 float and ₱800 counted match exactly.
  await page.goto(`/shop/${branchId}/close`);
  await expect(page.getByRole("heading", { name: "Daily close" })).toBeVisible();
  await expect(page.getByText("₱400").first()).toBeVisible();
  await page.getByLabel("Opening float (₱)").fill("500");
  await page.getByLabel("Cash counted (₱)").fill("800");
  await expect(page.getByText("₱800").first()).toBeVisible();
  await page.getByRole("button", { name: "Close day" }).click();
  await expect(page.getByText(/^Closed /)).toBeVisible();

  // Another walk-in cannot be checked out on the closed day.
  await startWalkIn(page, branchId, "Lito Late", "Trim", "Pia Diaz");
  await page.getByRole("button", { name: "Add payment" }).click();
  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByText("This business day is closed. Ask the owner to reopen it before adding sales.")).toBeVisible();

  // The owner reopens the day, and the sale goes through.
  const visitUrl = page.url();
  await page.goto(`/shop/${branchId}/close`);
  await page.getByRole("button", { name: "Reopen day" }).click();
  await expect(page.getByRole("button", { name: "Close day" })).toBeVisible();
  await page.goto(visitUrl);
  await page.getByRole("button", { name: "Add payment" }).click();
  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByRole("heading", { name: "Sale" })).toBeVisible();
});

test("a deposit larger than the final bill leaves nothing to collect and shows the refund due", async ({ page, browser }) => {
  const shopName = `Lumen Spa ${test.info().project.name} ${Date.now()}`;
  const { branchId, slug } = await publishNewShop(page, shopName, "Rockwell", "Facial", "Ria Lopez");

  // A guest books the ₱400 facial online and reports the ₱112 due (₱100 deposit and ₱12 fee).
  const guestContext = await browser.newContext();
  await standInForBotCheck(guestContext, "pass");
  const guest = await guestContext.newPage();
  await guest.goto(`/b/${slug}/book`);
  await chooseSlot(guest, { services: ["Facial"], staff: "Ria Lopez", openDateIndex: 0 });
  await guest.getByLabel("Your name").fill("Dee Deposit");
  await guest.getByLabel("Mobile number").fill("0917 555 7777");
  await guest.getByRole("button", { name: "Continue as guest" }).click();
  await acceptAndHold(guest);
  await guest.getByLabel("Reference number").fill("GC-DEP-1");
  await guest.getByRole("button", { name: "Report payment" }).click();
  await expect(guest.getByRole("heading", { name: "Payment under review" })).toBeVisible();
  await guestContext.close();

  // The owner accepts it, then finds the visit through the client list.
  await page.goto(`/shop/${branchId}/deposits`);
  await page.getByRole("button", { name: "Review payment: Dee Deposit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/shop/clients");
  await page.getByRole("link", { name: /Dee Deposit/ }).click();
  await page.getByRole("region", { name: "Visits" }).getByRole("link").first().click();
  await page.getByRole("button", { name: "Manage visit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Check in" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Manage visit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

  // The facial ends up costing ₱80: the ₱100 deposit covers it, leaving ₱20 to refund.
  await page.getByLabel("Price (₱)").fill("80");
  await expect(page.getByText("Refund ₱20 to the client outside GroomBox. Record it once it's done.")).toBeVisible();
  await expect(page.getByText("Nothing to collect.")).toBeVisible();
  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByRole("heading", { name: "Sale" })).toBeVisible();
  await page.getByRole("button", { name: "Record refund" }).click();
  const refund = page.getByRole("dialog");
  await expect(refund.getByLabel("Amount refunded (₱)")).toHaveValue("20.00");
  await refund.getByRole("button", { name: "Record refund" }).click();
  await expect(page.getByText("Refund recorded: ₱20")).toBeVisible();
});
