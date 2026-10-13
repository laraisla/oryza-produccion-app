import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loadDemo, openOrder } from "./helpers";

/** Revisión automática (axe, WCAG 2.1 A/AA). No reemplaza una prueba con personas. */
async function audit(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
}

test("pantallas principales sin violaciones graves de accesibilidad", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Todavía no hay pedidos")).toBeVisible();
  await audit(page);
  await loadDemo(page);
  await audit(page);
  await openOrder(page, "PED-103");
  await audit(page);
  await page.goto("/revision");
  await expect(page.getByRole("heading", { level: 1, name: "Revisión" })).toBeVisible();
  await audit(page);
  await page.goto("/importar");
  await expect(page.getByRole("heading", { level: 1, name: "Importar movimientos" })).toBeVisible();
  await audit(page);
  await page.goto("/pedidos/nuevo");
  await expect(page.getByRole("heading", { level: 1, name: "Nuevo pedido" })).toBeVisible();
  await audit(page);
  await page.goto("/datos");
  await expect(page.getByRole("heading", { level: 1, name: "Datos y límites" })).toBeVisible();
  await audit(page);
});

test("se puede aprobar una propuesta solo con teclado", async ({ page }) => {
  await loadDemo(page);
  await openOrder(page, "PED-101");
  const approve = page.getByRole("button", { name: "Aprobar asociación" });
  await approve.focus();
  await expect(approve).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("saldo")).toHaveText("$ 0");
});
