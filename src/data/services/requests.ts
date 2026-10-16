import { dec, toPlain } from '@/domain/decimal';
import { evaluateLot } from '@/domain/matching';
import type { RequestStatus } from '@/domain/catalogs';
import { assertCan, canViewLot, canViewRequest, AccessDeniedError } from '../access';
import { lotOffer, requestCriteria } from '../derive';
import type { BuyerRequest, Database } from '../model';
import { parse, requestSchema, type RequestInput } from '../schemas';
import { audit, diff, find, mutate, nextCode, trace, ValidationError, type ServiceContext } from './context';

function normalize(input: ReturnType<typeof requestSchema.parse>) {
  return {
    ...input,
    contactEmail: input.contactEmail || null,
    variety: input.variety?.trim() || null,
    maxBrokenPct: toPlain(dec(input.maxBrokenPct)),
    quantityT: toPlain(dec(input.quantityT)),
    packaging: {
      type: input.packaging.type,
      netWeightKg: input.packaging.type === 'bulk' ? null : (input.packaging.netWeightKg ?? null),
    },
    destinationCity: input.destinationCity ?? null,
    destinationPortId: input.destinationPortId ?? null,
    finalAddress: input.finalAddress ?? null,
    preferredIncoterm: (input.preferredIncoterm ?? null) as BuyerRequest['preferredIncoterm'],
    notes: input.notes ?? null,
    buyerDocuments: input.buyerDocuments.map((d) => ({ name: d.name, note: d.note ?? null })),
  };
}

export function createRequest(db: Database, ctx: ServiceContext, raw: RequestInput, publish = true) {
  assertCan(ctx.user, 'request.manage');
  const input = parse(requestSchema, raw);
  return mutate(db, (draft) => {
    const request: BuyerRequest = {
      id: ctx.newId(),
      code: nextCode(draft.requests, 'RFQ', ctx.today().slice(0, 4)),
      buyerOrganizationId: ctx.user.organizationId,
      status: publish ? 'published' : 'draft',
      ...normalize(input),
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
      createdBy: ctx.user.id,
    };
    draft.requests.push(request);
    audit(draft, ctx, 'request', request.id, 'create', `Solicitud ${request.code} creada (${request.quantityT} t)`);
    trace(draft, ctx, {
      type: 'request_created',
      title: `Solicitud ${request.code} ${publish ? 'publicada' : 'guardada como borrador'}`,
      entity: { kind: 'request', id: request.id },
      shared: request.visibility === 'public',
    });
    return request;
  });
}

export function updateRequest(db: Database, ctx: ServiceContext, requestId: string, raw: RequestInput) {
  const current = find(db.requests, requestId, 'Solicitud');
  assertCan(ctx.user, 'request.manage', current.buyerOrganizationId);
  if (current.status === 'closed' || current.status === 'cancelled') {
    throw new ValidationError('La solicitud está cerrada: crear una nueva en lugar de modificarla.');
  }
  const input = parse(requestSchema, raw);
  return mutate(db, (draft) => {
    const request = find(draft.requests, requestId, 'Solicitud');
    const before = { ...request };
    Object.assign(request, normalize(input), { updatedAt: ctx.now() });
    audit(
      draft,
      ctx,
      'request',
      request.id,
      'update',
      `Solicitud ${request.code} actualizada`,
      diff(before, request, ['commercialType', 'processing', 'maxBrokenPct', 'quantityT', 'packaging', 'destinationCountry', 'deliveryDate']),
    );
    return request;
  });
}

const REQUEST_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  draft: ['published', 'cancelled'],
  published: ['negotiating', 'closed', 'cancelled'],
  negotiating: ['published', 'closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

export function setRequestStatus(db: Database, ctx: ServiceContext, requestId: string, status: RequestStatus) {
  const current = find(db.requests, requestId, 'Solicitud');
  assertCan(ctx.user, 'request.manage', current.buyerOrganizationId);
  if (!REQUEST_TRANSITIONS[current.status].includes(status)) {
    throw new ValidationError(`No se puede pasar la solicitud de ${current.status} a ${status}.`);
  }
  return mutate(db, (draft) => {
    const request = find(draft.requests, requestId, 'Solicitud');
    request.status = status;
    request.updatedAt = ctx.now();
    audit(draft, ctx, 'request', request.id, 'status', `Solicitud ${request.code}: ${status}`);
    return request;
  });
}

/** Guarda la evidencia de una evaluación de matching (p. ej., al cotizar sobre ese resultado). */
export function saveMatchSnapshot(db: Database, ctx: ServiceContext, requestId: string, lotId: string) {
  const request = find(db.requests, requestId, 'Solicitud');
  const lot = find(db.lots, lotId, 'Lote');
  if (!canViewRequest(ctx.user, request) || !canViewLot(ctx.user, lot)) throw new AccessDeniedError();
  const offer = lotOffer(db, lot, ctx.today());
  if (!offer) throw new ValidationError('El lote no tiene producto u organización válidos.');
  const result = evaluateLot(requestCriteria(request), offer);
  return mutate(db, (draft) => {
    const snapshot = {
      id: ctx.newId(),
      organizationId: ctx.user.organizationId,
      requestId,
      result,
      evaluatedAt: ctx.now(),
      evaluatedBy: ctx.user.id,
    };
    draft.matchSnapshots.push(snapshot);
    return snapshot;
  });
}
