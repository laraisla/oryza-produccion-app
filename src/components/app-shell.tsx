"use client";

import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCobro } from "./cobro-provider";

const NAV = [
  { href: "/", label: "Pedidos" },
  { href: "/importar", label: "Importar movimientos" },
  { href: "/revision", label: "Revisión" },
  { href: "/datos", label: "Datos y límites" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/pedidos");
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ev } = useCobro();
  const pendingReview = ev ? ev.summary.proposals + ev.summary.review + ev.summary.openConflicts : 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Saltar al contenido
      </a>
      <div className="border-b border-amber-300 bg-amber-100 text-amber-950" role="note" aria-label="Aviso de demostración">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <FlaskConical aria-hidden className="size-4" />
            Demostración con datos sintéticos
          </span>
          <span className="hidden text-amber-900 sm:inline">
            Prototipo local: los datos quedan solo en este navegador. No se conecta con bancos ni verifica saldos.
          </span>
          <Link href="/datos#limites" className="font-medium underline underline-offset-2">
            Qué hace y qué no
          </Link>
        </div>
      </div>

      <header className="on-dark border-b border-brand-900 bg-brand-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex items-baseline gap-3 rounded">
            <span className="text-lg font-extrabold tracking-wide">COBRO CLARO</span>
            <span className="hidden text-sm text-brand-200 sm:inline">Cada pedido, con su cobro claro.</span>
          </Link>
          <nav aria-label="Principal" className="-mx-1">
            <ul className="flex flex-wrap gap-1">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                        active ? "bg-white text-brand-900" : "text-brand-100 hover:bg-brand-800 hover:text-white"
                      }`}
                    >
                      {item.label}
                      {item.href === "/revision" && pendingReview > 0 ? (
                        <span
                          className={`num rounded-full px-1.5 text-xs font-bold ${active ? "bg-brand-900 text-white" : "bg-amber-300 text-amber-950"}`}
                          aria-label={`${pendingReview} pendientes`}
                        >
                          {pendingReview}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>

      <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-slate-600">
          COBRO CLARO es un prototipo de entrenamiento. Concilia los datos que se le suministran; no autentica el
          origen de los archivos ni certifica acreditaciones o saldos bancarios.
        </div>
      </footer>
    </div>
  );
}
