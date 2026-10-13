/**
 * Base local en IndexedDB (Dexie). Un comercio por navegador; sin
 * sincronización ni respaldo automático. El nombre es propio de esta app:
 * borrar datos solo elimina esta base, nunca otro almacenamiento.
 */
import Dexie, { type EntityTable } from "dexie";
import type {
  Allocation,
  HistoryEntry,
  ImportBatch,
  ImportConflict,
  Movement,
  Order,
  PaymentClaim,
  Rejection,
} from "@/domain/schemas";

export const DB_NAME = "cobro-claro-prototipo";

export class CobroDB extends Dexie {
  orders!: EntityTable<Order, "id">;
  claims!: EntityTable<PaymentClaim, "id">;
  movements!: EntityTable<Movement, "key">;
  imports!: EntityTable<ImportBatch, "id">;
  conflicts!: EntityTable<ImportConflict, "id">;
  allocations!: EntityTable<Allocation, "id">;
  rejections!: EntityTable<Rejection, "id">;
  history!: EntityTable<HistoryEntry, "seq">;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      orders: "id, &referenceKey, createdAt",
      claims: "id, orderId",
      movements: "key, externalId, date",
      imports: "id, importedAt",
      conflicts: "id, movementKey, status",
      // activeKey solo existe en asignaciones vigentes: índice único por par pedido–movimiento.
      allocations: "id, movementKey, orderId, status, &activeKey",
      rejections: "id, &[orderId+movementKey]",
      history: "++seq, at",
    });
  }

  get allTables() {
    return [
      this.orders,
      this.claims,
      this.movements,
      this.imports,
      this.conflicts,
      this.allocations,
      this.rejections,
      this.history,
    ];
  }
}

let browserDb: CobroDB | null = null;

/** Instancia única en el navegador. */
export function getDb(): CobroDB {
  if (!browserDb) browserDb = new CobroDB();
  return browserDb;
}

/** Elimina SOLO la base de esta aplicación. */
export async function deleteAppDatabase(db: CobroDB): Promise<void> {
  db.close();
  await Dexie.delete(db.name);
  if (browserDb === db) browserDb = null;
}
