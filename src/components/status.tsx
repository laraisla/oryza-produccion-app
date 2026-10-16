import { ExternalLink, FileText, FlaskConical, ShieldAlert, ShieldCheck, ShieldQuestion, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DOCUMENT_STATUS,
  OPERATION_STATUS,
  PARTIES,
  RECONCILIATION_STATUS,
  REQUEST_STATUS,
  SHIPMENT_STATUS,
  VERIFICATION_HELP,
  VERIFICATION_STATUS,
  VERSION_STATUS,
  type DocumentStatus,
  type OperationStatus,
  type Party,
  type ReconciliationStatus,
  type RequestStatus,
  type ShipmentStatus,
  type VerificationStatus,
  type VersionStatus,
} from '@/domain/catalogs';
import { MATCH_STATUS_LABEL, type MatchStatus } from '@/domain/matching';
import { Badge, type BadgeTone } from './ui/badge';
import { cn } from './ui/cn';
import { Tooltip } from './ui/misc';

const VERIFICATION_TONE: Record<VerificationStatus, BadgeTone> = {
  verified: 'success',
  quoted: 'info',
  estimated: 'warning',
  pending: 'neutral',
  expired: 'danger',
};

export function VerificationBadge({ status, label }: { status: VerificationStatus; label?: string }) {
  const Icon = status === 'verified' ? ShieldCheck : status === 'expired' ? ShieldAlert : status === 'pending' ? ShieldQuestion : status === 'quoted' ? Timer : FlaskConical;
  return (
    <Tooltip content={VERIFICATION_HELP[status]}>
      <span className="inline-flex">
        <Badge tone={VERIFICATION_TONE[status]}>
          <Icon aria-hidden />
          {label ?? (status === 'pending' ? 'Pendiente de verificación' : VERIFICATION_STATUS[status])}
        </Badge>
      </span>
    </Tooltip>
  );
}

const DOC_TONE: Record<DocumentStatus, BadgeTone> = {
  pending: 'neutral',
  in_preparation: 'info',
  submitted: 'petrol',
  verified: 'success',
  observed: 'warning',
  not_applicable: 'outline',
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return <Badge tone={DOC_TONE[status]}>{DOCUMENT_STATUS[status]}</Badge>;
}

const VERSION_TONE: Record<VersionStatus, BadgeTone> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  expired: 'warning',
  superseded: 'outline',
};

export function VersionStatusBadge({ status }: { status: VersionStatus }) {
  return <Badge tone={VERSION_TONE[status]}>{VERSION_STATUS[status]}</Badge>;
}

const REQUEST_TONE: Record<RequestStatus, BadgeTone> = {
  draft: 'neutral',
  published: 'info',
  negotiating: 'petrol',
  closed: 'success',
  cancelled: 'outline',
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={REQUEST_TONE[status]}>{REQUEST_STATUS[status]}</Badge>;
}

const OPERATION_TONE: Record<OperationStatus, BadgeTone> = {
  negotiation: 'neutral',
  confirmed: 'petrol',
  in_preparation: 'info',
  shipped: 'info',
  collected: 'success',
  closed: 'success',
  cancelled: 'outline',
};

export function OperationStatusBadge({ status }: { status: OperationStatus }) {
  return <Badge tone={OPERATION_TONE[status]}>{OPERATION_STATUS[status]}</Badge>;
}

const SHIPMENT_TONE: Record<ShipmentStatus, BadgeTone> = {
  planned: 'neutral',
  dispatched: 'info',
  shipped: 'petrol',
  received: 'success',
  exception: 'danger',
};

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return <Badge tone={SHIPMENT_TONE[status]}>{SHIPMENT_STATUS[status]}</Badge>;
}

const RECON_TONE: Record<ReconciliationStatus, BadgeTone> = {
  no_data: 'neutral',
  partial: 'info',
  difference_to_review: 'warning',
  reconciled_by_operator: 'success',
};

export function ReconciliationBadge({ status }: { status: ReconciliationStatus }) {
  return <Badge tone={RECON_TONE[status]}>{RECONCILIATION_STATUS[status]}</Badge>;
}

const MATCH_TONE: Record<MatchStatus, BadgeTone> = { compatible: 'success', conditional: 'warning', incompatible: 'danger' };

export function MatchBadge({ status }: { status: MatchStatus }) {
  return <Badge tone={MATCH_TONE[status]}>{MATCH_STATUS_LABEL[status]}</Badge>;
}

export function PayerBadge({ payer, agreed }: { payer: Party; agreed?: boolean }) {
  return (
    <Badge tone={payer === 'seller' ? 'petrol' : 'outline'}>
      {PARTIES[payer]}
      {agreed ? ' (pactado)' : ''}
    </Badge>
  );
}

export function DemoBadge() {
  return (
    <Tooltip content="Todos los datos son ficticios: empresas, lotes, precios, tarifas y documentos. No representan operaciones reales.">
      <span className="inline-flex">
        <Badge tone="warning">DEMO · datos ficticios</Badge>
      </span>
    </Tooltip>
  );
}

/**
 * Respaldo de un dato: enlace cuando es una URL (externa o una ruta interna `#/...`)
 * y texto cuando es una referencia documental sin URL (p. ej. "Informe LAB-0928").
 */
export function EvidenceRef({ value, label = 'respaldo', className }: { value: string; label?: ReactNode; className?: string }) {
  const external = /^https?:\/\//i.test(value);
  if (external || value.startsWith('#/')) {
    return (
      <a href={value} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} className={cn('inline-flex items-center gap-0.5 text-petrol-700 hover:underline', className)}>
        {label}
        {external ? <ExternalLink className="size-3" aria-hidden /> : null}
      </a>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-slate-600', className)} title="Referencia documental (sin URL)">
      <FileText className="size-3 shrink-0" aria-hidden />
      {value}
    </span>
  );
}
