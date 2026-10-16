import { Check, Circle, Lock, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { TraceEvent, TraceEventType } from '@/data/model';
import { orgName, userName } from '@/data/selectors';
import { useDb } from '@/data/store';
import { fmtDateTime } from '@/domain/format';

export const STANDARD_STEPS: { label: string; types: TraceEventType[] }[] = [
  { label: 'Lote creado', types: ['lot_created'] },
  { label: 'Calidad registrada', types: ['quality_recorded'] },
  { label: 'Oferta publicada', types: ['offer_published'] },
  { label: 'Solicitud aceptada', types: ['request_accepted'] },
  { label: 'Cotización confirmada', types: ['quotation_confirmed'] },
  { label: 'Preparación documental', types: ['documents_prepared'] },
  { label: 'Despacho', types: ['dispatched'] },
  { label: 'Embarque', types: ['shipped'] },
  { label: 'Cobro', types: ['payment_received'] },
  { label: 'Conciliación', types: ['reconciled'] },
];

export function StandardTimeline({ events, hiddenFinance }: { events: TraceEvent[]; hiddenFinance?: boolean }) {
  const db = useDb();
  return (
    <Card>
      <CardHeader title="Hitos de la operación" description="Cada hito muestra quién lo registró y cuándo" />
      <CardContent>
        <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
          {STANDARD_STEPS.map((step) => {
            const ev = events.find((e) => step.types.includes(e.type));
            const finance = step.types.some((t) => t === 'payment_received' || t === 'reconciled');
            const review = step.label === 'Conciliación' && !ev ? events.find((e) => e.type === 'reconciliation_review') : undefined;
            return (
              <li key={step.label} className="relative">
                <span className={`absolute -left-[33px] flex size-6 items-center justify-center rounded-full border-2 ${ev ? 'border-emerald-600 bg-emerald-600 text-white' : review ? 'border-amber-500 bg-amber-50 text-amber-600' : 'border-slate-300 bg-white text-slate-300'}`}>
                  {ev ? <Check className="size-3.5" /> : finance && hiddenFinance ? <Lock className="size-3" /> : <Circle className="size-2.5" />}
                </span>
                <p className={`text-sm font-medium ${ev ? 'text-slate-900' : 'text-slate-500'}`}>{step.label}</p>
                {ev ? (
                  <p className="text-xs text-slate-600">{ev.title} · {fmtDateTime(ev.at)} · {userName(db, ev.actorUserId)} ({orgName(db, ev.organizationId)})</p>
                ) : review ? (
                  <p className="text-xs text-amber-700">En revisión: {review.detail}</p>
                ) : finance && hiddenFinance ? (
                  <p className="text-xs text-slate-400">Información financiera privada del vendedor</p>
                ) : (
                  <p className="text-xs text-slate-400">Pendiente</p>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export function EventLog({ events }: { events: TraceEvent[] }) {
  const db = useDb();
  return (
    <Card>
      <CardHeader title="Registro completo de eventos" description="Orden cronológico; los eventos privados solo los ve su organización" />
      <ol className="divide-y divide-slate-100">
        {[...events].reverse().map((e) => (
          <li key={e.id} className="flex gap-3 px-4 py-2.5">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-petrol-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{e.title}</p>
              {e.detail ? <p className="text-xs text-slate-600">{e.detail}</p> : null}
              <p className="text-[11px] text-slate-500">{fmtDateTime(e.at)} · {userName(db, e.actorUserId)} · {orgName(db, e.organizationId)}</p>
            </div>
            {e.shared ? <Badge tone="outline"><Users /> Compartido</Badge> : <Badge><Lock /> Privado</Badge>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
