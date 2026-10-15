import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Cada página puede poner su título; se muestra como "Cargar cosecha · Oryza".
  title: { default: "Oryza · Cosechas", template: "%s · Oryza" },
  description: "Registro de cosechas de arroz por lote",
};

export const viewport: Viewport = {
  // Color de la barra del navegador en el celular.
  themeColor: "#15803d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-stone-50 text-stone-900">
        {children}
      </body>
    </html>
  );
}
