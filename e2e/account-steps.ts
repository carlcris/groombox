import { expect, type Page } from "@playwright/test";

export const seededPassword = "groombox-local";

export function uniqueEmail(role: string): string {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
}

export async function signUp(page: Page, fullName: string, email: string) {
  await page.getByLabel("Your name").fill(fullName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("groombox-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
}

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(seededPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Signs up a new owner and creates their shop with one branch, open 10:00 AM to 8:00 PM daily.
// Returns the branch id from the floor URL.
export async function createOwnerWithShop(page: Page, businessName: string, branchName: string): Promise<string> {
  await page.goto("/sign-up");
  await signUp(page, "Ana Owner", uniqueEmail("owner"));
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
  return branchId;
}
