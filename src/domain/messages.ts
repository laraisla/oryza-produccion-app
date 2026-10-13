/**
 * Borradores de mensajes para el cliente. Son editables y NUNCA se envían
 * solos: la persona los copia y decide si usarlos.
 *
 * Reglas de redacción: tono neutral, sin acusaciones, y sin revelar datos de
 * otros clientes u otros pedidos.
 */
import { formatDate } from "./dates";
import { formatArs } from "./money";
import type { Evaluation, OrderEvaluation } from "./reconcile";

export interface MessageDraft {
  id: string;
  title: string;
  text: string;
}

function greeting(name: string): string {
  return `Hola ${name.trim()}, ¿cómo estás?`;
}

export function messageDrafts(ev: OrderEvaluation, all: Evaluation): MessageDraft[] {
  const o = ev.order;
  const drafts: MessageDraft[] = [];
  const codes = new Set(ev.findings.map((f) => f.code));
  const until = all.coverage.to ? ` (revisamos movimientos hasta el ${formatDate(all.coverage.to)})` : "";

  if (codes.has("DECL_MOV_USADO") || codes.has("DECL_MOV_REF_OTRO")) {
    const f = ev.findings.find((x) => x.code === "DECL_MOV_USADO" || x.code === "DECL_MOV_REF_OTRO");
    const claim = ev.claims.find((c) => c.id === f?.claimId);
    drafts.push({
      id: "operacion-a-revisar",
      title: "Pedir los datos de la transferencia",
      text: `${greeting(o.customerName)} Te escribimos por el pedido ${o.reference}. El comprobante que nos enviaste${claim?.mentionedOperation ? ` (operación ${claim.mentionedOperation})` : ""} no coincide con lo que vemos para este pedido en nuestros registros. Puede tratarse de una confusión. ¿Nos podrías enviar la fecha, el importe y el número de operación de la transferencia de este pedido? ¡Gracias!`,
    });
  }

  if (codes.has("DECL_SIN_MOVIMIENTO") || codes.has("DECL_OP_NO_ENCONTRADA") || codes.has("SIN_MOVIMIENTOS")) {
    drafts.push({
      id: "no-encontrado",
      title: "Consultar un pago que todavía no vemos",
      text: `${greeting(o.customerName)} Te escribimos por el pedido ${o.reference} por ${formatArs(o.totalMinor)}. Todavía no vemos el pago en los movimientos que revisamos${until}; puede que aún no figure. ¿Nos confirmás la fecha, el importe y el número de operación? ¡Gracias!`,
    });
  }

  if (ev.status === "parcial") {
    drafts.push({
      id: "saldo",
      title: "Consultar por el saldo",
      text: `${greeting(o.customerName)} Te escribimos por el pedido ${o.reference}. Registramos ${formatArs(ev.allocatedMinor)} de un total de ${formatArs(o.totalMinor)}, así que quedan ${formatArs(ev.outstandingMinor)} por conciliar. Si ya hiciste otro pago, ¿nos pasás la fecha y el número de operación? ¡Gracias!`,
    });
  }

  const ambiguous = ev.findings.find((f) => f.code === "CAND_IMPORTE_AMBIGUO" || f.code === "CAND_IMPORTE");
  if (ambiguous) {
    const mv = all.movements.get(ambiguous.movementKeys[0] ?? "")?.movement;
    if (mv) {
      drafts.push({
        id: "confirmar-pedido",
        title: "Confirmar a qué pedido corresponde un pago",
        text: `${greeting(o.customerName)} Recibimos una transferencia de ${formatArs(mv.amountMinor)} el ${formatDate(mv.date)} sin la referencia del pedido. ¿Nos confirmás si corresponde a tu pedido ${o.reference}? Si podés, enviános el número de operación. ¡Gracias!`,
      });
    }
  }

  if (codes.has("REF_MOV_PENDIENTE") || codes.has("REF_MOV_REVERTIDO") || codes.has("DECL_MOV_NO_ACREDITADO")) {
    drafts.push({
      id: "no-acreditado",
      title: "Avisar que el pago aún no figura acreditado",
      text: `${greeting(o.customerName)} Te escribimos por el pedido ${o.reference}. El pago todavía no figura como acreditado en los movimientos que revisamos${until}. Lo volvemos a revisar con la próxima actualización. Si tenés el número de operación, ¿nos lo pasás? ¡Gracias!`,
    });
  }

  if (codes.has("REF_PEDIDO_CONCILIADO")) {
    drafts.push({
      id: "pago-adicional",
      title: "Consultar un pago adicional",
      text: `${greeting(o.customerName)} Te escribimos por el pedido ${o.reference}, que ya figura cubierto. Vemos otro movimiento con la misma referencia. ¿Nos confirmás si fue para otro pedido o si se hizo dos veces? Así lo revisamos. ¡Gracias!`,
    });
  }

  return drafts;
}
