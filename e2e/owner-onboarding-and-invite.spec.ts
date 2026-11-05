import { expect, test } from "@playwright/test";
import { signIn, signUp, uniqueEmail } from "./account-steps";

// Phase 1 exit criterion: an owner signs up, creates an organization and branch, and invites a
// manager who joins.

test("an owner sets up a shop and a manager joins through an invite link", async ({ page, browser }) => {
  const businessName = `Lumen Spa ${test.info().project.name} ${Date.now()}`;

  await page.goto("/sign-up");
  await signUp(page, "Ana Owner", uniqueEmail("owner"));
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Set up your shop" })).toBeVisible();

  // The screen owns validation: an empty submit shows errors under the fields.
  await page.getByRole("button", { name: "Create my shop" }).click();
  await expect(page.getByText("Enter this.").first()).toBeVisible();
  await expect(page.getByText("Choose the type of shop.")).toBeVisible();

  await page.getByLabel("Business name").fill(businessName);
  await page.getByLabel("Type of shop").click();
  await page.getByRole("option", { name: "Spa" }).click();
  await page.getByLabel("Branch name").fill("Poblacion");
  await page.getByLabel("Street address").fill("12 Kalayaan Avenue");
  await page.getByLabel("City").fill("Makati");
  await page.getByLabel("Area").fill("Poblacion");

  // Saturday runs past midnight: 2:00 PM to 2:00 AM.
  const saturday = page.getByRole("listitem").filter({ hasText: "Saturday" });
  await saturday.getByLabel("Opens").fill("14:00");
  await saturday.getByLabel("Closes", { exact: true }).fill("02:00");
  await page.getByRole("button", { name: "Create my shop" }).click();
  await expect(saturday.getByText(/Closing time must be after opening time/)).toBeVisible();
  await saturday.getByLabel("Closes next day").check();
  await page.getByRole("button", { name: "Create my shop" }).click();

  await expect(page).toHaveURL(/\/shop\/[0-9a-f-]+\/floor$/);
  await expect(page.getByRole("heading", { name: "Floor" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Poblacion", { exact: true })).toBeVisible();

  await page.goto("/shop/team");
  await expect(page.getByText("Ana Owner")).toBeVisible();
  await page.getByRole("button", { name: "Invite someone" }).click();
  await page.getByLabel("Role").click();
  await page.getByRole("option", { name: "Manager" }).click();
  await expect(page.getByRole("checkbox", { name: "Poblacion" })).toBeChecked();
  await page.getByRole("button", { name: "Create invite link" }).click();
  const inviteLink = await page.getByRole("textbox", { name: "Your invite link is ready" }).inputValue();
  expect(inviteLink).toMatch(/\/invite\/[0-9A-HJKMNP-TV-Z]{16}$/);
  await page.getByRole("button", { name: "Done" }).click();

  // The invitee opens the link in their own browser, sees the invite before signing in, and joins.
  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await managerPage.goto(inviteLink);
  await expect(managerPage.getByText(`Join ${businessName} on GroomBox as manager.`)).toBeVisible();
  await expect(managerPage.getByText("Poblacion")).toBeVisible();
  await managerPage.getByRole("link", { name: "Create an account to join" }).click();
  await signUp(managerPage, "Ben Manager", uniqueEmail("manager"));
  await managerPage.getByRole("button", { name: `Join ${businessName}` }).click();
  await expect(managerPage).toHaveURL(/\/shop\/[0-9a-f-]+\/floor$/);
  await expect(managerPage.getByRole("heading", { name: "Floor" })).toBeVisible();
  await expect(managerPage.getByRole("main").getByText("Poblacion", { exact: true })).toBeVisible();

  // The same link cannot be used twice.
  await managerPage.goto(inviteLink);
  await expect(managerPage.getByRole("heading", { name: "Invite not available" })).toBeVisible();
  await managerContext.close();

  // The owner sees the new manager on the team.
  await page.reload();
  const managerRow = page.getByRole("listitem").filter({ hasText: "Ben Manager" });
  await expect(managerRow.getByText("Manager", { exact: true })).toBeVisible();
  await expect(managerRow.getByText("Poblacion")).toBeVisible();
});

test("a manager cannot open the team page", async ({ page }) => {
  await signIn(page, "manager@haven.test");
  await expect(page).toHaveURL(/\/shop\/30000000-0000-0000-0000-000000000002\/floor$/);
  await page.goto("/shop/team");
  await expect(page).toHaveURL(/\/shop\/30000000-0000-0000-0000-000000000002\/floor$/);
});

test("members of a restricted organization see the notice", async ({ page }) => {
  await signIn(page, "staff@kanto.test");
  await expect(page).toHaveURL(/\/shop\/restricted$/);
  await expect(page.getByRole("heading", { name: "This account is on hold" })).toBeVisible();
  await expect(page.getByText("Ask the owner to settle the account.", { exact: false })).toBeVisible();
});
