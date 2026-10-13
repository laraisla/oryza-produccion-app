import "@fontsource-variable/inter";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { CobroProvider } from "@/components/cobro-provider";
import { NoticeProvider } from "@/components/notices";

export const metadata: Metadata = {
  title: { default: "COBRO CLARO — prototipo", template: "%s · COBRO CLARO" },
  description: "Cada pedido, con su cobro claro. Prototipo de conciliación de pedidos con movimientos importados (datos sintéticos).",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0c2a4d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>
        <NoticeProvider>
          <CobroProvider>
            <AppShell>{children}</AppShell>
          </CobroProvider>
        </NoticeProvider>
      </body>
    </html>
  );
}
