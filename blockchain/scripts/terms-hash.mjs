#!/usr/bin/env node
// Hash SHA-256 de las condiciones comerciales de una orden.
// JSON canónico: claves ordenadas recursivamente, sin espacios.
// Debe coincidir con src/lib/stellar/terms.ts (mismo algoritmo).
//
// Uso: node blockchain/scripts/terms-hash.mjs <archivo.json>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const file = process.argv[2];
if (!file) {
  console.error("Uso: node terms-hash.mjs <archivo.json>");
  process.exit(1);
}
const json = JSON.parse(readFileSync(file, "utf8"));
process.stdout.write(createHash("sha256").update(canonical(json)).digest("hex"));
