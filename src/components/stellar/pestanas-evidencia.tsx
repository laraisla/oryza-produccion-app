import { Link } from "@tanstack/react-router";
import { FileCheck2, History } from "lucide-react";
import { cn } from "@/lib/utils";

/** Separa la evidencia documental actual (confirmada) de la demo histórica de escrow Soroban. */
export function PestanasEvidencia({ activa }: { activa: "documental" | "escrow" }) {
  const pestanas = [
    {
      id: "documental" as const,
      to: "/evidencia-stellar/documental" as const,
      label: "Registro documental",
      detalle: "Actual · confirmado en Testnet",
      Icon: FileCheck2,
    },
    {
      id: "escrow" as const,
      to: "/evidencia-stellar" as const,
      label: "Escrow Soroban",
      detalle: "Demo histórica",
      Icon: History,
    },
  ];
  return (
    <nav aria-label="Tipo de evidencia" className="mb-6 flex flex-wrap gap-2">
      {pestanas.map(({ id, to, label, detalle, Icon }) => (
        <Link
          key={id}
          to={to}
          aria-current={activa === id ? "page" : undefined}
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
            activa === id
              ? "border-primary/40 bg-accent font-semibold text-foreground"
              : "border-border text-muted-foreground hover:bg-accent/60",
          )}
        >
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block">{label}</span>
            <span className="block text-[11px] font-normal text-muted-foreground">{detalle}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
