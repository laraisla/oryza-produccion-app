import { describe, expect, it } from "vitest";
import { findMentionedKeys, referenceKey, validateOrderReference } from "@/domain/references";

describe("referencias explícitas", () => {
  it("normaliza variantes de escritura", () => {
    expect(referenceKey("PED-101")).toBe("PED-101");
    expect(referenceKey("ped 101")).toBe("PED-101");
    expect(referenceKey("PED101")).toBe("PED-101");
  });

  it("encuentra la referencia como secuencia completa de tokens", () => {
    expect(findMentionedKeys("Transferencia PED-101 Ana", ["PED-101"])).toEqual(["PED-101"]);
    expect(findMentionedKeys("pago ped101", ["PED-101"])).toEqual(["PED-101"]);
  });

  it("no confunde PED-1010 con PED-101 ni números sueltos", () => {
    expect(findMentionedKeys("PED-1010", ["PED-101"])).toEqual([]);
    expect(findMentionedKeys("101", ["PED-101"])).toEqual([]);
    expect(findMentionedKeys("Pago pedido", ["PED-101", "PED-102"])).toEqual([]);
  });

  it("si una referencia contiene a otra, gana la más larga", () => {
    expect(findMentionedKeys("PED-101-2", ["PED-101", "PED-101-2"])).toEqual(["PED-101-2"]);
  });

  it("detecta varias referencias distintas", () => {
    expect(findMentionedKeys("PED-105 y PED-106", ["PED-105", "PED-106"]).sort()).toEqual(["PED-105", "PED-106"]);
  });

  it("valida el formato de referencia de pedido", () => {
    expect(validateOrderReference("PED-101")).toBeNull();
    expect(validateOrderReference("101")).not.toBeNull();
    expect(validateOrderReference("PEDIDO")).not.toBeNull();
    expect(validateOrderReference("<b>PED-1</b>")).not.toBeNull();
  });
});
