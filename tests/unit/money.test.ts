import { describe, expect, it } from "vitest";
import { addMinor, formatArs, MAX_MINOR, parseArsText, parseCsvAmount, subMinor, sumMinor } from "@/domain/money";
import { parseDate, formatDate } from "@/domain/dates";

describe("dinero en centavos enteros", () => {
  it("$45.000 equivale a 4.500.000 centavos", () => {
    expect(parseArsText("$45.000")).toEqual({ ok: true, minor: 4_500_000 });
    expect(parseCsvAmount("45000.00")).toEqual({ ok: true, minor: 4_500_000 });
    expect(parseCsvAmount("45000")).toEqual({ ok: true, minor: 4_500_000 });
  });

  it("parsea decimales sin aritmética de punto flotante", () => {
    // 0.1 + 0.2 en binario no da 0.3; acá todo es entero.
    expect(parseCsvAmount("0.10")).toEqual({ ok: true, minor: 10 });
    expect(parseCsvAmount("0.2")).toEqual({ ok: true, minor: 20 });
    expect(addMinor(10, 20)).toBe(30);
    expect(parseCsvAmount("12500.50")).toEqual({ ok: true, minor: 1_250_050 });
    expect(parseArsText("45.000,50")).toEqual({ ok: true, minor: 4_500_050 });
    expect(parseArsText("$ 18000")).toEqual({ ok: true, minor: 1_800_000 });
  });

  it("rechaza importes inválidos, negativos, cero o ambiguos", () => {
    expect(parseCsvAmount("-100").ok).toBe(false);
    expect(parseCsvAmount("0").ok).toBe(false);
    expect(parseCsvAmount("0.00").ok).toBe(false);
    expect(parseCsvAmount("45.000,00").ok).toBe(false); // el CSV no usa separador de miles
    expect(parseCsvAmount("12.345").ok).toBe(false); // más de dos decimales
    expect(parseCsvAmount("1e5").ok).toBe(false);
    expect(parseCsvAmount("abc").ok).toBe(false);
    expect(parseCsvAmount("").ok).toBe(false);
    expect(parseArsText("45.00").ok).toBe(false); // punto no agrupa de a tres: ambiguo
    expect(parseArsText("-5").ok).toBe(false);
  });

  it("rechaza importes fuera del rango seguro", () => {
    expect(parseCsvAmount("99999999999999999999").ok).toBe(false);
    expect(parseCsvAmount(String(MAX_MINOR / 100 + 1)).ok).toBe(false);
    expect(() => addMinor(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
    expect(() => addMinor(0.5, 1)).toThrow(RangeError);
  });

  it("suma y resta enteros", () => {
    expect(sumMinor([2_000_000, 1_000_000])).toBe(3_000_000);
    expect(subMinor(3_000_000, 2_000_000)).toBe(1_000_000);
  });

  it("formatea en pesos argentinos", () => {
    expect(formatArs(4_500_000)).toBe("$ 45.000");
    expect(formatArs(4_500_050)).toBe("$ 45.000,50");
    expect(formatArs(1_000_000)).toBe("$ 10.000");
    expect(formatArs(5)).toBe("$ 0,05");
  });
});

describe("fechas", () => {
  it("acepta AAAA-MM-DD y DD/MM/AAAA", () => {
    expect(parseDate("2026-09-15")).toEqual({ ok: true, iso: "2026-09-15" });
    expect(parseDate("15/09/2026")).toEqual({ ok: true, iso: "2026-09-15" });
    expect(formatDate("2026-09-15")).toBe("15/09/2026");
  });
  it("rechaza fechas inexistentes o ambiguas", () => {
    expect(parseDate("2026-02-30").ok).toBe(false);
    expect(parseDate("31/04/2026").ok).toBe(false);
    expect(parseDate("09-15-2026").ok).toBe(false);
    expect(parseDate("15/09").ok).toBe(false);
  });
});
