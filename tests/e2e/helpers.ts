import { expect, type Page } from "@playwright/test";

export async function loadDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Cargar ejemplo" }).click();
  await expect(page.getByRole("heading", { name: /Lista de pedidos/ })).toBeVisible();
}

export async function openOrder(page: Page, reference: string) {
  await page.goto("/");
  await page.getByRole("link", { name: `Revisar ${reference}`, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(`^${reference}`) })).toBeVisible();
}

/** Texto de un importe tal como lo muestra la app ($ + espacio duro). */
export const ars = (s: string) => `$ ${s}`;
