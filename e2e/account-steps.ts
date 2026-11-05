import { expect, type Page } from "@playwright/test";

export const seededPassword = "groombox-local";

export function uniqueEmail(role: string): string {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
}

// The password of every account the tests sign up.
export const signedUpPassword = "groombox-e2e";

export async function signUp(page: Page, fullName: string, email: string) {
  await page.getByLabel("Your name").fill(fullName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(signedUpPassword);
  await page.getByRole("button", { name: "Create account" }).click();
}

export async function signIn(page: Page, email: string, password = seededPassword) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Signs up a new owner and creates their shop with one branch, open 10:00 AM to 8:00 PM daily.
// Returns the branch id from the floor URL and the owner's email.
export async function createOwnerWithShop(
  page: Page,
  businessName: string,
  branchName: string,
): Promise<{ branchId: string; email: string }> {
  const email = uniqueEmail("owner");
  await page.goto("/sign-up");
  await signUp(page, "Ana Owner", email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Business name").fill(businessName);
  await page.getByLabel("Type of shop").click();
  await page.getByRole("option", { name: "Salon", exact: true }).click();
  await page.getByLabel("Branch name").fill(branchName);
  await page.getByLabel("Street address").fill("12 Kalayaan Avenue");
  await page.getByLabel("City").fill("Makati");
  await page.getByLabel("Area").fill("Poblacion");
  await page.getByRole("button", { name: "Create my shop" }).click();
  await expect(page).toHaveURL(/\/shop\/[0-9a-f-]+\/floor$/);
  const branchId = /\/shop\/([0-9a-f-]+)\/floor$/.exec(page.url())?.[1];
  if (!branchId) throw new Error("The floor URL has no branch id.");
  return { branchId, email };
}

// Adds a category with one service, and a staff member who performs it at the shop's one branch.
export async function addServiceAndStaff(page: Page, serviceName: string, staffName: string) {
  await page.goto("/shop/setup/services");
  await page.getByLabel("Category name").fill("Hair");
  await page.getByRole("button", { name: "Add category" }).click();
  await page.getByRole("button", { name: "Add service" }).click();
  const serviceSheet = page.getByRole("dialog");
  await serviceSheet.getByLabel("Service name").fill(serviceName);
  await serviceSheet.getByLabel("Duration (minutes)").fill("30");
  await serviceSheet.getByLabel("Price (₱)").fill("400");
  await serviceSheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(serviceName, { exact: true })).toBeVisible();
  await page.goto("/shop/setup/staff");
  await page.getByRole("button", { name: "Add staff member" }).click();
  const staffSheet = page.getByRole("dialog");
  await staffSheet.getByLabel("Name shown to clients").fill(staffName);
  await staffSheet.getByRole("checkbox", { name: serviceName }).check();
  await staffSheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(staffName, { exact: true })).toBeVisible();
}
