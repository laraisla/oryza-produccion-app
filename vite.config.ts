// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Con la firma Stellar de demo habilitada, el servidor de desarrollo escucha solo en
// loopback: nadie de la red local puede llegar al endpoint de firma.
const env = loadEnv("development", process.cwd(), "STELLAR_");
const firmaDemo = (process.env["STELLAR_DEMO_SIGNING"] ?? env["STELLAR_DEMO_SIGNING"]) === "1";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  ...(firmaDemo ? { vite: { server: { host: "127.0.0.1" } } } : {}),
});
