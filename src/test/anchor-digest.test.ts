import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, contentBytes, sha256 } from "@/lib/stellar/anchor/digest";
import { ANCHOR_MAX_BYTES } from "@/lib/stellar/anchor/types";

describe("anchor digest and strict serialization", () => {
  it("reproduces SHA-256 independently and detects byte changes", async () => {
    const bytes = new TextEncoder().encode("abc");
    expect(await sha256(bytes)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await sha256(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(await sha256(new TextEncoder().encode("abd"))).not.toBe(await sha256(bytes));
  });
  it("sorts recursively, preserves arrays and uses decimal strings verbatim", () => {
    expect(canonicalJson({ z: [2, 1], a: { price: "12.50", currency: "USD" } })).toBe(
      '{"a":{"currency":"USD","price":"12.50"},"z":[2,1]}',
    );
    expect(canonicalJson({ a: { currency: "USD", price: "12.50" }, z: [2, 1] })).toBe(
      canonicalJson({ z: [2, 1], a: { price: "12.50", currency: "USD" } }),
    );
  });
  it.each([
    NaN,
    Infinity,
    -Infinity,
    1.25,
    -0,
    9007199254740992,
    undefined,
    1n,
    new Date(),
    new Map(),
    () => 1,
    "\ud800",
  ])("rejects non-canonical values %s", (v) => {
    expect(() => canonicalJson({ value: v })).toThrow();
  });
  it("accepts valid surrogate pairs and rejects holes, cycles, accessors and extra array keys", () => {
    expect(canonicalJson("🌾")).toBe('"🌾"');
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(() => canonicalJson(circular)).toThrow();
    expect(() => canonicalJson(Array(2))).toThrow();
    expect(() =>
      canonicalJson(
        Object.defineProperty({}, "getter", {
          get: () => {
            throw new Error("Must never invoke");
          },
          enumerable: true,
        }),
      ),
    ).toThrow();
    const arr = [1];
    Object.assign(arr, { extra: 2 });
    expect(() => canonicalJson(arr)).toThrow();
  });
  it("rejects empty content, deep input and oversized documents", () => {
    expect(() => contentBytes({ kind: "document", bytes: new Uint8Array() })).toThrow();
    expect(() =>
      contentBytes({ kind: "document", bytes: new Uint8Array(ANCHOR_MAX_BYTES + 1) }),
    ).toThrow();
    expect(() => contentBytes({ kind: "agreement", conditions: {} })).toThrow();
    let value: unknown = "x";
    for (let i = 0; i < 70; i++) value = { nested: value };
    expect(() => canonicalJson(value)).toThrow();
  });
});
