import { describe, expect, it, vi } from "vitest";

import {
  EMISOR_ACTIVOS,
  HorizonError,
  LIQUIDACIONES_DVP,
  consultarSaldos,
  consultarTransaccion,
  esHashValido,
  parsearOperaciones,
} from "@/lib/horizon";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const hash = LIQUIDACIONES_DVP[0].hash;

describe("horizon", () => {
  it("valida hashes y rechaza inválidos sin llamar a Horizon", async () => {
    expect(esHashValido(hash)).toBe(true);
    for (const malo of ["", "abc", hash.toUpperCase(), `${hash}0`, "g".repeat(64)]) expect(esHashValido(malo)).toBe(false);
    const f = vi.fn();
    await expect(consultarTransaccion("xyz", f as unknown as typeof fetch)).rejects.toMatchObject({ tipo: "hash_invalido" });
    expect(f).not.toHaveBeenCalled();
  });

  it("interpreta operaciones sin asumir campos ni activos", () => {
    const ops = parsearOperaciones([
      { type: "payment", from: "GA", to: "GB", amount: "10.0000000", asset_code: "ARROZ", asset_issuer: EMISOR_ACTIVOS },
      { type: "payment", from: "GA", to: "GB", amount: "5.0000000", asset_code: "USDC", asset_issuer: "GOTRO" },
      { type: "manage_data" },
      null,
    ]);
    expect(ops).toHaveLength(3);
    expect(ops[0]).toMatchObject({ activo: "ARROZ", monto: "10.0000000" });
    expect(ops[1]!.activo).toBe("otro"); // mismo código, otro emisor: no se presenta como de la plataforma
    expect(ops[2]).toEqual({ tipo: "manage_data" });
    expect(parsearOperaciones(undefined)).toEqual([]);
  });

  it("consulta transacción con memo y operaciones", async () => {
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/operations?limit=50")
        ? json({ _embedded: { records: [{ type: "payment", from: "GA", to: "GB", amount: "1.0", asset_code: "USDC", asset_issuer: EMISOR_ACTIVOS }] } })
        : json({ successful: true, ledger: 7, created_at: "2026-10-01T10:00:00Z", memo: "ARZ-92b9ffc0-S", memo_type: "text", source_account: "GA" }),
    );
    const t = await consultarTransaccion(hash, f as unknown as typeof fetch);
    expect(t).toMatchObject({ exitosa: true, memo: "ARZ-92b9ffc0-S", ledger: 7 });
    expect(t.operaciones[0]!.activo).toBe("USDC de prueba");
  });

  it("devuelve error controlado si Horizon falla o no responde", async () => {
    const caido = vi.fn(async () => { throw new TypeError("network"); });
    await expect(consultarTransaccion(hash, caido as unknown as typeof fetch)).rejects.toMatchObject({ tipo: "no_disponible" });
    const e500 = vi.fn(async () => json({}, 503));
    await expect(consultarSaldos("G".padEnd(56, "A"), e500 as unknown as typeof fetch)).rejects.toBeInstanceOf(HorizonError);
    await expect(consultarSaldos("mala")).rejects.toMatchObject({ tipo: "cuenta_invalida" });
  });

  it("rechaza respuestas incompletas en lugar de inventar datos", async () => {
    const f = vi.fn(async () => json({ _embedded: { records: [] } }));
    await expect(consultarTransaccion(hash, f as unknown as typeof fetch)).rejects.toMatchObject({ tipo: "no_disponible" });
  });
});
