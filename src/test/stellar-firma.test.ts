import { Keypair } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { esIpLoopback, firmaHabilitada } from "@/lib/stellar/stellar.server";

const VARS = [
  "STELLAR_DEMO_SIGNING",
  "STELLAR_DEMO_BUYER_SECRET",
  "STELLAR_DEMO_SELLER_SECRET",
  "STELLAR_DEMO_ARBITER_SECRET",
];
const previas = Object.fromEntries(VARS.map((v) => [v, process.env[v]]));

afterEach(() => {
  for (const v of VARS) {
    if (previas[v] === undefined) delete process.env[v];
    else process.env[v] = previas[v];
  }
  vi.unstubAllEnvs();
});

describe("firma con cuentas de prueba", () => {
  it("solo acepta IPs de loopback del socket, nunca nombres de host", () => {
    for (const ip of ["127.0.0.1", "127.0.0.2", "::1", "::ffff:127.0.0.1"]) {
      expect(esIpLoopback(ip)).toBe(true);
    }
    for (const ip of [
      undefined,
      "",
      "localhost",
      "192.168.0.76",
      "10.0.0.5",
      "::ffff:192.168.0.1",
      "fe80::1",
      "127.0.0.1.example.com",
      "instant-capture-grid.lovable.app",
    ]) {
      expect(esIpLoopback(ip)).toBe(false);
    }
  });

  it("nunca se habilita para clientes que no son loopback o sin IP conocida", () => {
    process.env["STELLAR_DEMO_SIGNING"] = "1";
    for (const ip of [undefined, "localhost", "192.168.0.76", "example.com"]) {
      expect(firmaHabilitada(ip)).toBe(false);
    }
  });

  it("requiere STELLAR_DEMO_SIGNING=1", () => {
    delete process.env["STELLAR_DEMO_SIGNING"];
    expect(firmaHabilitada("127.0.0.1")).toBe(false);
  });

  it("rechaza claves que no corresponden a las cuentas de prueba registradas", () => {
    process.env["STELLAR_DEMO_SIGNING"] = "1";
    // Clave válida pero ajena al despliegue, generada al vuelo (nunca se escribe en el repo).
    const ajena = Keypair.random().secret();
    process.env["STELLAR_DEMO_BUYER_SECRET"] = ajena;
    process.env["STELLAR_DEMO_SELLER_SECRET"] = ajena;
    process.env["STELLAR_DEMO_ARBITER_SECRET"] = ajena;
    expect(firmaHabilitada("127.0.0.1")).toBe(false);
  });

  it("queda deshabilitada fuera de desarrollo aunque las variables estén cargadas", () => {
    process.env["STELLAR_DEMO_SIGNING"] = "1";
    vi.stubEnv("NODE_ENV", "production");
    expect(firmaHabilitada("127.0.0.1")).toBe(false);
  });
});
