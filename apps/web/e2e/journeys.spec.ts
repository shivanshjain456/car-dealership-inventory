import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_SCREENSHOT_DIR } from './constants.js';

mkdirSync(E2E_SCREENSHOT_DIR, { recursive: true });

async function expectAccessible(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    accessibility.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary
      }))
    }))
  ).toEqual([]);
}

async function registerCustomer(page: Page): Promise<string> {
  const email = `buyer-${randomUUID()}@example.test`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('e2e-customer-passphrase');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'The collection.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Creta N Line' })).toBeVisible();
  return email;
}

async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email address').fill(E2E_ADMIN_EMAIL);
  await page.getByLabel('Password').fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'The collection.' })).toBeVisible();
  await expect(page.getByText('ADMIN', { exact: true })).toBeVisible();
}

test('customer can register, browse, purchase one unit, and see sold-out stock', async ({
  page
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Sign in to explore the collection' })
  ).toBeVisible();
  await expectAccessible(page);
  await registerCustomer(page);
  await expect(page.getByRole('button', { name: 'Purchase Hyundai Creta N Line' })).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Purchase Tata Nexon EV Empowered' })
  ).toBeDisabled();

  await page.screenshot({ path: `${E2E_SCREENSHOT_DIR}/catalog-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Purchase Hyundai Creta N Line' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Stock updated: one Hyundai Creta N Line unit was deducted. No payment was processed.'
  );
  await expect(
    page.getByText('Purchases update inventory only; no payment is processed.')
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Purchase Hyundai Creta N Line' })).toBeDisabled();
  const soldOutCard = page.locator('.vehicle-card').filter({
    has: page.getByRole('heading', { name: 'Creta N Line' })
  });
  await expect(soldOutCard.getByText('Out of stock')).toBeVisible();
});

test('Admin can edit, restock, and hard-delete a vehicle', async ({ page }) => {
  await signInAsAdmin(page);
  await expectAccessible(page);
  await page.getByLabel('Make').fill('Kia');
  await page.getByRole('button', { name: 'Apply filters' }).click();

  const originalCard = page.locator('.vehicle-card').filter({
    has: page.getByRole('heading', { name: 'EV6 GT-Line' })
  });
  await expect(originalCard).toBeVisible();
  await originalCard.getByRole('button', { name: 'Edit details' }).click();

  const editRegion = page.getByRole('region', { name: 'Edit vehicle details' });
  await editRegion.getByLabel('Model').fill('EV6 GT-Line Signature');
  await expectAccessible(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${E2E_SCREENSHOT_DIR}/admin-inventory-edit.png`, fullPage: true });
  await editRegion.getByRole('button', { name: 'Save vehicle' }).click();

  const updatedCard = page.locator('.vehicle-card').filter({
    has: page.getByRole('heading', { name: 'EV6 GT-Line Signature' })
  });
  await expect(updatedCard).toBeVisible();
  await expect(page.getByRole('status')).toContainText('EV6 GT-Line Signature details updated.');

  await updatedCard.getByRole('button', { name: 'Restock' }).click();
  await page.getByLabel('Quantity to add for EV6 GT-Line Signature').fill('3');
  await updatedCard.getByRole('button', { name: 'Add stock' }).click();
  await expect(updatedCard.getByText('5 in stock')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('stock updated to 5');

  await updatedCard.getByRole('button', { name: 'Delete' }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Delete this vehicle?' });
  await expect(confirmation).toContainText('permanently removed');
  await expectAccessible(page);
  await confirmation.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByRole('heading', { name: 'EV6 GT-Line Signature' })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'No vehicles match your filters.' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear all filters' })).toBeVisible();
});

test('catalog supports keyboard interaction and fits a narrow mobile viewport', async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await registerCustomer(page);

  const toggle = page.getByRole('button', { name: 'Filters' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Close' })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  await expect(page.getByLabel('Search the collection')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${E2E_SCREENSHOT_DIR}/catalog-mobile.png`, fullPage: true });
  await expectAccessible(page);
});

test('Admin can start with empty inventory and add the first vehicle', async ({ page }) => {
  await signInAsAdmin(page);

  const catalogResponse = await page.request.get('/api/vehicles?limit=100');
  expect(catalogResponse.ok()).toBe(true);
  const catalog = (await catalogResponse.json()) as {
    items: Array<{ id: string; version: number }>;
  };
  for (const vehicle of catalog.items) {
    const deleteResponse = await page.request.delete(`/api/vehicles/${vehicle.id}`, {
      headers: { 'If-Match': `"${vehicle.version}"` }
    });
    expect(deleteResponse.status()).toBe(204);
  }

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'No vehicles have been added yet.' })
  ).toBeVisible();
  await expect(
    page.getByText('Purchases update inventory only; no payment is processed.')
  ).toBeVisible();
  await expectAccessible(page);
  await page.screenshot({
    path: `${E2E_SCREENSHOT_DIR}/admin-inventory-empty.png`,
    fullPage: true
  });

  await page.getByRole('button', { name: 'Add your first vehicle' }).click();
  const form = page.getByRole('region', { name: 'Add a vehicle' });
  await expect(form).toBeVisible();
  await form.getByLabel('Make').fill('Kia');
  await form.getByLabel('Model').fill('EV6 GT-Line');
  await form.getByLabel('Category').fill('Electric');
  await form.getByLabel('Price (major units)').fill('54990.00');
  await form.getByLabel('Currency').selectOption('USD');
  await form.getByLabel('Starting stock').fill('1');
  await page.screenshot({
    path: `${E2E_SCREENSHOT_DIR}/admin-add-first-vehicle.png`,
    fullPage: true
  });
  await form.getByRole('button', { name: 'Save vehicle' }).click();

  await expect(page.getByRole('heading', { name: 'EV6 GT-Line' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Kia EV6 GT-Line added to the collection.');
});
