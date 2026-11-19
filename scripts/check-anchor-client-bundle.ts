/** Read-only check of the ACTUAL production client output. No environment values are read. */
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(".output/public");
let checked = 0;
async function inspect(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else if (/\.(js|mjs|html|json|map)$/.test(entry.name)) {
      const text = await readFile(path, "utf8");
      checked++;
      if (
        text.includes("STELLAR_ANCHOR_SECRET") ||
        text.includes("Secreto ausente, inválido o no correspondiente") ||
        text.includes("writer.lock") ||
        text.includes("STELLAR_ANCHOR_CLI_IDENTITY") ||
        text.includes("--sign-with-key") ||
        text.includes("local-web-viewer") ||
        text.includes("Consulta de solo lectura") ||
        /\bS[A-Z2-7]{55}\b/.test(text)
      )
        throw new Error("Client bundle boundary check failed (no content printed)");
    }
  }
}
await inspect(root);
if (!checked) throw new Error("No client output to inspect; run bun run build first");
console.log(
  `Anchor client boundary: ${checked} files checked; no private seeds or anchor signer/repository code detected.`,
);
