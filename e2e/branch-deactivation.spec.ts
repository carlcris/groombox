import { expect, test } from "@playwright/test";
import { publishNewShop } from "./account-steps";
import { acceptAndHold, chooseSlot, standInForBotCheck } from "./booking-steps";

// The branch setup screen refuses to deactivate a branch that has upcoming bookings (app flow §10).

test("a branch with an upcoming booking cannot be deactivated", async ({ page, browser }) => {
  const shopName = `Lumen Salon ${test.info().project.name} ${Date.now()}`;
  const { slug } = await publishNewShop(page, shopName, "Ortigas", "Blowout", "Ria Lopez");

  // A guest holds a slot through the new branch's link.
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
