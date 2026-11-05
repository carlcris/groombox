import { expect, test } from "@playwright/test";
import { createOwnerWithShop, pixelImage, signIn } from "./account-steps";

// Phase 2 exit criteria: an owner takes a new organization from empty to a published branch using
// only the app; the setup screen will not publish while a required item is missing, or remove the
// last required item from a published branch; a manager changes their own branch's hours,
// offerings, and shifts, but not the catalogue, payment details, or another branch.

const havenBgcBranchId = "30000000-0000-0000-0000-000000000002";
const havenMakatiBranchId = "30000000-0000-0000-0000-000000000001";

test("an owner takes a new organization from empty to a published branch", async ({ page }) => {
  const { branchId } = await createOwnerWithShop(page, `Nara Salon ${test.info().project.name} ${Date.now()}`, "Legaspi");

  // The floor shows what is left, and the branch cannot be published yet.
  await expect(page.getByRole("heading", { name: "Finish setting up Legaspi" })).toBeVisible();
  await page.goto("/shop/setup/branches");
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();

  await page.goto("/shop/setup/policies");
  await page.getByRole("button", { name: "Accept the terms" }).click();
  await expect(page.getByText(/You accepted the terms on/)).toBeVisible();

  await page.goto("/shop/setup/services");
  await page.getByLabel("Category name").fill("Hair");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText("Hair", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add service" }).click();
  const serviceSheet = page.getByRole("dialog");
  await serviceSheet.getByLabel("Service name").fill("Haircut");
  await serviceSheet.getByLabel("Duration (minutes)").fill("45");
  await serviceSheet.getByLabel("Price (₱)").fill("350");
  await serviceSheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Haircut", { exact: true })).toBeVisible();

  await page.goto("/shop/setup/staff");
  await page.getByRole("button", { name: "Add staff member" }).click();
  const staffSheet = page.getByRole("dialog");
  await staffSheet.getByLabel("Name shown to clients").fill("Nina Cruz");
  await expect(staffSheet.getByRole("checkbox", { name: "Legaspi" })).toBeChecked();
  await staffSheet.getByRole("checkbox", { name: "Haircut" }).check();
  await staffSheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Nina Cruz", { exact: true })).toBeVisible();

  // Offering checkboxes show the saved state, so they change once the server confirms.
  await page.goto(`/shop/${branchId}/setup`);
  await page.getByRole("checkbox", { name: "Haircut" }).click();
  await expect(page.getByRole("checkbox", { name: "Haircut" })).toBeChecked();
  await page.getByRole("button", { name: "Add shift" }).click();
  await expect(page.getByText("Monday 10:00 AM – 7:00 PM")).toBeVisible();

  await page.goto("/shop/setup/branches");
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
  await page.getByRole("button", { name: "Payment details" }).click();
  const paymentSheet = page.getByRole("dialog");
  await paymentSheet.getByLabel("Account name").fill("Nara Salon");
  await paymentSheet.getByLabel("Account number").fill("0917 123 4567");
  await paymentSheet.locator('input[type="file"]').setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: pixelImage });
  await expect(paymentSheet.getByRole("img", { name: "QR image" })).toBeVisible();
  await paymentSheet.getByRole("button", { name: "Save" }).click();
  await expect(paymentSheet).toBeHidden();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy booking link" })).toBeVisible();

  // The published branch keeps its last service until it is unpublished.
  await page.goto(`/shop/${branchId}/setup`);
  await page.getByRole("checkbox", { name: "Haircut" }).click();
  await expect(page.getByText("This branch is published and this is its last service. Unpublish the branch first.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Haircut" })).toBeChecked();
});

test("a manager changes their own branch's setup, and nothing of the owner's", async ({ page }) => {
  // The phone and desktop runs change different seeded rows, so they can run side by side.
  const isPhone = test.info().project.name === "phone";
  const serviceName = isPhone ? "Haircut" : "Hair color";
  const shiftDay = isPhone ? "Saturday" : "Sunday";

  await signIn(page, "manager@haven.test");
  await expect(page).toHaveURL(new RegExp(`/shop/${havenBgcBranchId}/floor$`));

  await page.goto(`/shop/${havenBgcBranchId}/setup`);
  await page.getByRole("button", { name: "Save hours" }).click();
  await expect(page.getByText("Hours saved")).toBeVisible();

  const offering = page.getByRole("checkbox", { name: serviceName });
  await offering.click();
  await expect(offering).toBeChecked();
  await offering.click();
  await expect(offering).not.toBeChecked();

  await page.getByLabel("Day", { exact: true }).click();
  await page.getByRole("option", { name: shiftDay }).click();
  await page.getByLabel("Starts", { exact: true }).fill("14:00");
  await page.getByLabel("Ends", { exact: true }).fill("02:00");
  await page.getByRole("checkbox", { name: "Ends next day" }).check();
  await page.getByRole("button", { name: "Add shift" }).click();
  const shiftLabel = `${shiftDay} 2:00 PM – 2:00 AM (ends next day)`;
  await expect(page.getByText(shiftLabel)).toBeVisible();
  await page.getByRole("button", { name: `Remove ${shiftLabel}` }).click();
  await expect(page.getByText(shiftLabel)).toBeHidden();

  // The owner's screens and the other branch stay out of reach.
  await page.goto("/shop/setup/services");
  await expect(page).not.toHaveURL(/\/shop\/setup/);
  await page.goto("/shop/setup/branches");
  await expect(page).not.toHaveURL(/\/shop\/setup/);
  await page.goto(`/shop/${havenMakatiBranchId}/setup`);
  await expect(page).not.toHaveURL(new RegExp(havenMakatiBranchId));
});
