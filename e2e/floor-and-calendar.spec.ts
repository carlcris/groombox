import { expect, test, type Page } from "@playwright/test";
import { addServiceAndStaff, createOwnerWithShop, signedUpPassword, signIn } from "./account-steps";

// Phase 5 exit criteria: two devices on the same branch stay in sync without a refresh; a walk-in
// goes from the queue to in service and takes a calendar slot; a staff member finds an existing
// client from the walk-in sheet and never sees client notes. That a staff-entered appointment has
// no deposit or fee is checked in supabase/tests/floor_and_calendar.test.sql; here the shop enters
// one and finds it on the calendar.
//
// The first test builds its own shop, so reruns and the phone and desktop runs never share a queue.

// The business date in Manila: the local date after subtracting the 5:00 AM business day start.
function manilaBusinessDate(daysAhead: number): string {
  return new Date(Date.now() + (8 - 5) * 3_600_000 + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

async function showFloorTab(page: Page, tab: "Waiting" | "In service") {
  if (test.info().project.name === "phone") await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
}

test("two devices stay in step as a walk-in goes from the queue to the calendar", async ({ page, browser }) => {
  const { branchId, email } = await createOwnerWithShop(page, `Tala Salon ${test.info().project.name} ${Date.now()}`, "Kapitolyo");
  await addServiceAndStaff(page, "Trim", "Oscar Diaz");
  await page.goto(`/shop/${branchId}/setup`);
  await page.getByRole("checkbox", { name: "Trim" }).click();
  await expect(page.getByRole("checkbox", { name: "Trim" })).toBeChecked();

  // A second device on the same branch, open on the floor before anything happens.
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await signIn(second, email, signedUpPassword);
  await expect(second).toHaveURL(new RegExp(`/shop/${branchId}/floor$`));
  await expect(second.getByRole("heading", { name: "Floor" })).toBeVisible();

  // The first device adds a walk-in; it appears on the second without a refresh.
  await page.goto(`/shop/${branchId}/floor`);
  await page.getByRole("button", { name: "Add walk-in" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "New client" }).click();
  await sheet.getByLabel("Client name").fill("Walt Walker");
  await sheet.getByRole("checkbox", { name: /^Trim/ }).check();
  await sheet.getByRole("button", { name: "Add to queue" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("listitem", { name: "Walt Walker" }).getByText("No. 1")).toBeVisible();
  await showFloorTab(second, "Waiting");
  const walkInOnSecond = second.getByRole("listitem", { name: "Walt Walker" });
  await expect(walkInOnSecond).toBeVisible();

  // The second device starts the service with Oscar; the first sees it move to In service.
  await walkInOnSecond.getByRole("button", { name: "Start" }).click();
  const startSheet = second.getByRole("dialog");
  await startSheet.getByLabel("Staff member").click();
  await second.getByRole("option", { name: "Oscar Diaz" }).click();
  await startSheet.getByRole("button", { name: "Start" }).click();
  await expect(startSheet).toBeHidden();
  await showFloorTab(page, "In service");
  const inService = page.getByRole("region", { name: /^In service/ }).getByRole("listitem", { name: "Walt Walker" });
  await expect(inService).toBeVisible();
  await expect(inService.getByText("In service")).toBeVisible();

  // The walk-in now holds a slot on the calendar.
  await page.goto(`/shop/${branchId}/calendar`);
  await expect(page.getByRole("region", { name: "Oscar Diaz" }).getByRole("button", { name: /Walt Walker/ })).toBeVisible();

  // The shop enters an appointment for tomorrow; it shows on tomorrow's calendar, confirmed.
  await page.getByRole("button", { name: "Add appointment" }).click();
  const appointment = page.getByRole("dialog");
  await appointment.getByRole("button", { name: "New client" }).click();
  await appointment.getByLabel("Client name").fill("Ada Appointment");
  await appointment.getByRole("checkbox", { name: /^Trim/ }).check();
  await appointment.getByLabel("Staff member").click();
  await page.getByRole("option", { name: "Oscar Diaz" }).click();
  await appointment.getByLabel("Date").fill(manilaBusinessDate(1));
  await appointment.getByLabel("Time").fill("15:00");
  await appointment.getByRole("button", { name: "Add appointment" }).click();
  await expect(appointment).toBeHidden();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("region", { name: "Oscar Diaz" }).getByRole("button", { name: /Ada Appointment/ }).click();
  await expect(page.getByRole("dialog").getByText("Confirmed")).toBeVisible();
  await secondContext.close();
});

test("a staff member finds an existing client from the walk-in sheet without seeing notes", async ({ page }) => {
  await signIn(page, "staff@haven.test");
  await expect(page).toHaveURL(/\/shop\/30000000-0000-0000-0000-000000000001\/floor$/);
  await page.getByRole("button", { name: "Add walk-in" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Find a client by name or mobile number").fill("0505");
  await sheet.getByRole("button", { name: /Rico Dela Cruz/ }).click();
  await expect(sheet.getByText("0918 555 0505")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Patch test first");
  await sheet.getByRole("checkbox", { name: /^Haircut/ }).check();
  await sheet.getByRole("button", { name: "Add to queue" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("listitem", { name: "Rico Dela Cruz" }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Patch test first");

  // The client list, where notes live, is for owners and managers.
  await page.goto("/shop/clients");
  await expect(page).not.toHaveURL(/\/shop\/clients/);
});

test("the owner edits a client's notes and merges a duplicate record", async ({ page }) => {
  const suffix = `${test.info().project.name} ${Date.now()}`;
  await signIn(page, "owner@haven.test");
  await expect(page).toHaveURL(/\/shop\//);
  // The same client entered twice as a new walk-in at Makati.
  await page.goto("/shop/30000000-0000-0000-0000-000000000001/floor");
  for (const name of [`Kai Keeper ${suffix}`, `Kai Copy ${suffix}`]) {
    await page.getByRole("button", { name: "Add walk-in" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "New client" }).click();
    await sheet.getByLabel("Client name").fill(name);
    await sheet.getByRole("checkbox", { name: /^Haircut/ }).check();
    await sheet.getByRole("button", { name: "Add to queue" }).click();
    await expect(sheet).toBeHidden();
  }

  await page.goto("/shop/clients");
  await page.getByLabel("Search by name or mobile number").fill(`Kai Keeper ${suffix}`);
  await page.getByRole("link", { name: new RegExp(`Kai Keeper ${suffix}`) }).click();
  await page.getByRole("button", { name: "Edit details" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByLabel("Notes").fill("Prefers mornings.");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("Prefers mornings.")).toBeVisible();

  await page.getByRole("button", { name: "Merge a duplicate" }).click();
  const merge = page.getByRole("dialog");
  await merge.getByLabel("Search by name or mobile number").fill(`Kai Copy ${suffix}`);
  await merge.getByRole("button", { name: new RegExp(`Kai Copy ${suffix}`) }).click();
  await merge.getByRole("button", { name: `Merge into Kai Keeper ${suffix}` }).click();
  await expect(merge).toBeHidden();
  await expect(page.getByRole("region", { name: "Visits" }).getByRole("listitem")).toHaveCount(2);
});
