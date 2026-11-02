// ============================================================
// Horizon (Stellar TESTNET) — consultas de solo lectura desde el navegador.
// Solo datos públicos. Nunca claves secretas ni mainnet.
// ============================================================

export const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
export const EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx";
export const EXPLORER_CUENTA = "https://stellar.expert/explorer/testnet/account";

const HASH_RE = /^[0-9a-f]{64}$/;
const CUENTA_RE = /^G[A-Z2-7]{55}$/;

export const esHashValido = (h: string): boolean => HASH_RE.test(h);
export const esCuentaValida = (c: string): boolean => CUENTA_RE.test(c);
export const urlTx = (hash: string): string => `${EXPLORER_TX}/${hash}`;
export const urlCuenta = (cuenta: string): string => `${EXPLORER_CUENTA}/${cuenta}`;

/** Datos públicos de las liquidaciones DvP experimentales (motor AgroFlow). */
export const EMISOR_ACTIVOS = "GAAGN2LNYHGIL4REVQKXPVLUVMRFXJERQDQA7CA3TYPJN3532GISKYVS";
export const CUENTAS_DVP = {
  molino: "GBTNXTJJ6TX7NUGVVHIT5ZNOMHSQZN2J56SX6IWQBGP6TBIX4EMAF4XX",
  comprador: "GATFOBOR43K2IMR3CBKDFHZP6CMUB4MOF56EGC7GSI2YBX5OF4RIJW62",
  escrow: "GASAI6VN2UVJXRJO624EXV6SSRE4VLGPDR45A6CWETD5HEFCSSXKL6KW",
} as const;
export const LIQUIDACIONES_DVP = [
  { id: "DvP 1", hash: "1ffed69c27d34bb5c992a45a969dfbdc9c606096b527931f0505570af3b08405", memoEsperado: "ARZ-92b9ffc0-S" },
  { id: "DvP 2", hash: "cc7285369074b567c81bad73016da164e7e8ab52084352e787a715c4d87f551b", memoEsperado: undefined as string | undefined },
] as const;

export class HorizonError extends Error {
  constructor(
    message: string,
    readonly tipo: "hash_invalido" | "cuenta_invalida" | "no_encontrada" | "no_disponible",
  ) {
    super(message);
    this.name = "HorizonError";
  }
}

export type ActivoClasificado = "ARROZ" | "USDC de prueba" | "XLM" | "otro";

export interface OperacionHorizon {
  tipo: string;
  /** Solo se completa cuando Horizon devolvió esos campos. */
  de?: string;
  a?: string;
  monto?: string;
  codigoActivo?: string;
  emisor?: string;
  activo?: ActivoClasificado;
}

export interface TransaccionHorizon {
  hash: string;
  exitosa: boolean;
  fecha: string;
  ledger: number;
  memo?: string;
  memoTipo?: string;
  cuentaOrigen: string;
  operaciones: OperacionHorizon[];
}

export interface SaldoHorizon {
  codigo: string;
  emisor?: string;
  saldo: string;
  activo: ActivoClasificado;
}

/** Clasifica un activo solo si el emisor coincide con el emisor de prueba de la plataforma. */
export function clasificarActivo(codigo: string | undefined, emisor: string | undefined, nativo = false): ActivoClasificado {
  if (nativo) return "XLM";
  if (emisor === EMISOR_ACTIVOS && codigo === "ARROZ") return "ARROZ";
  if (emisor === EMISOR_ACTIVOS && codigo === "USDC") return "USDC de prueba";
  return "otro";
}

type Registro = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Interpreta operaciones de Horizon sin asumir campos: lo que falta queda sin definir. */
export function parsearOperaciones(registros: unknown): OperacionHorizon[] {
  if (!Array.isArray(registros)) return [];
  return registros
    .filter((r): r is Registro => typeof r === "object" && r !== null)
    .map((r) => {
      const tipo = str(r["type"]) ?? "desconocida";
      const op: OperacionHorizon = { tipo };
      if (tipo === "payment" || tipo.startsWith("path_payment")) {
        const nativo = str(r["asset_type"]) === "native";
        const codigo = nativo ? "XLM" : str(r["asset_code"]);
        const emisor = str(r["asset_issuer"]);
        const de = str(r["from"]);
        const a = str(r["to"]);
        const monto = str(r["amount"]);
        if (de) op.de = de;
        if (a) op.a = a;
        if (monto) op.monto = monto;
        if (codigo) op.codigoActivo = codigo;
        if (emisor) op.emisor = emisor;
        op.activo = clasificarActivo(codigo, emisor, nativo);
      }
      return op;
    });
}

async function pedir(url: string, fetchFn: typeof fetch, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchFn(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (r.status === 404) throw new HorizonError("Horizon no encontró el recurso", "no_encontrada");
    if (!r.ok) throw new HorizonError(`Horizon respondió ${r.status}`, "no_disponible");
    return await r.json();
  } catch (e) {
    if (e instanceof HorizonError) throw e;
    throw new HorizonError("Horizon no disponible", "no_disponible");
  } finally {
    clearTimeout(t);
  }
}

/** Consulta una transacción y sus operaciones. El hash se valida ANTES de llamar a Horizon. */
export async function consultarTransaccion(hash: string, fetchFn: typeof fetch = fetch, timeoutMs = 8000): Promise<TransaccionHorizon> {
  if (!esHashValido(hash)) throw new HorizonError("Hash inválido: se esperan 64 caracteres hexadecimales en minúscula", "hash_invalido");
  const [tx, ops] = await Promise.all([
    pedir(`${HORIZON_TESTNET}/transactions/${hash}`, fetchFn, timeoutMs) as Promise<Registro>,
    pedir(`${HORIZON_TESTNET}/transactions/${hash}/operations?limit=50`, fetchFn, timeoutMs) as Promise<Registro>,
  ]);
  const embebido = (ops["_embedded"] as Registro | undefined)?.["records"];
  const fecha = str(tx["created_at"]);
  const ledger = typeof tx["ledger"] === "number" ? tx["ledger"] : undefined;
  if (!fecha || ledger === undefined) throw new HorizonError("Respuesta de Horizon incompleta", "no_disponible");
  const memo = str(tx["memo"]);
  const memoTipo = str(tx["memo_type"]);
  return {
    hash,
    exitosa: tx["successful"] === true,
    fecha,
    ledger,
    ...(memo !== undefined ? { memo } : {}),
    ...(memoTipo !== undefined ? { memoTipo } : {}),
    cuentaOrigen: str(tx["source_account"]) ?? "",
    operaciones: parsearOperaciones(embebido),
  };
}

/** Saldos actuales de una cuenta pública. */
export async function consultarSaldos(cuenta: string, fetchFn: typeof fetch = fetch, timeoutMs = 8000): Promise<SaldoHorizon[]> {
  if (!esCuentaValida(cuenta)) throw new HorizonError("Cuenta inválida", "cuenta_invalida");
  const j = (await pedir(`${HORIZON_TESTNET}/accounts/${cuenta}`, fetchFn, timeoutMs)) as Registro;
  const balances = Array.isArray(j["balances"]) ? (j["balances"] as Registro[]) : [];
  return balances.flatMap((b) => {
    const saldo = str(b["balance"]);
    if (saldo === undefined) return [];
    const nativo = str(b["asset_type"]) === "native";
    const codigo = nativo ? "XLM" : str(b["asset_code"]);
    if (!codigo) return [];
    const emisor = str(b["asset_issuer"]);
    return [{ codigo, ...(emisor ? { emisor } : {}), saldo, activo: clasificarActivo(codigo, emisor, nativo) }];
  });
}
