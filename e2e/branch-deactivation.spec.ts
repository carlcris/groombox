import { expect, test } from "@playwright/test";
import { addServiceAndStaff, createOwnerWithShop } from "./account-steps";
import { acceptAndHold, chooseSlot, standInForBotCheck } from "./booking-steps";

// The branch setup screen refuses to deactivate a branch that has upcoming bookings (app flow §10).

// A 1 × 1 PNG, standing in for a payment QR image.
const qrImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
  "base64",
);

test("a branch with an upcoming booking cannot be deactivated", async ({ page, browser }) => {
  const shopName = `Lumen Salon ${test.info().project.name} ${Date.now()}`;
  const { branchId } = await createOwnerWithShop(page, shopName, "Ortigas");

  // Publish the branch with one service, one staff member, a shift, and payment details.
  await page.goto("/shop/setup/policies");
  await page.getByRole("button", { name: "Accept the terms" }).click();
  await expect(page.getByText(/You accepted the terms on/)).toBeVisible();
  await addServiceAndStaff(page, "Blowout", "Ria Lopez");
  await page.goto(`/shop/${branchId}/setup`);
  await page.getByRole("checkbox", { name: "Blowout" }).click();
  await expect(page.getByRole("checkbox", { name: "Blowout" })).toBeChecked();
  await page.getByRole("button", { name: "Add shift" }).click();
  await expect(page.getByText("Monday 10:00 AM – 7:00 PM")).toBeVisible();
  await page.goto("/shop/setup/branches");
  await page.getByRole("button", { name: "Payment details" }).click();
  const paymentSheet = page.getByRole("dialog");
  await paymentSheet.getByLabel("Account name").fill("Lumen Salon");
  await paymentSheet.getByLabel("Account number").fill("0917 765 4321");
  await paymentSheet.locator('input[type="file"]').setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: qrImage });
  await expect(paymentSheet.getByRole("img", { name: "QR image" })).toBeVisible();
  await paymentSheet.getByRole("button", { name: "Save" }).click();
  await expect(paymentSheet).toBeHidden();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  // A guest holds a slot through the new branch's link. Its slug is the shop and branch names,
  // slugified, which the timestamp keeps unique.
  const slug = `${shopName} Ortigas`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const guestContext = await browser.newContext();
  await standInForBotCheck(guestContext, "pass");
  const guestPage = await guestContext.newPage();
  await guestPage.goto(`/b/${slug}/book`);
  await chooseSlot(guestPage, { services: ["Blowout"], staff: "Ria Lopez", openDateIndex: 0 });
  await guestPage.getByLabel("Your name").fill("Gina Guest");
  await guestPage.getByLabel("Mobile number").fill("0917 555 3333");
  await guestPage.getByRole("button", { name: "Continue as guest" }).click();
  await acceptAndHold(guestPage);
  await guestContext.close();

  // Unpublished, the branch offers deactivation, which the upcoming booking blocks.
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByText("Not published", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Deactivate branch" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deactivate branch" }).click();
  await expect(
    page.getByRole("dialog").getByText("This branch has upcoming bookings. Cancel or finish them before deactivating it."),
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Ortigas" })).toBeVisible();
});
