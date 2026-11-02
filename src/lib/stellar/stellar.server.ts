// ============================================================
// Acceso a Stellar TESTNET desde el servidor.
// - Lectura (siempre disponible): estado del acuerdo vía simulación
//   de `get`, eventos del contrato (Soroban RPC), verificación de
//   hashes de transacción (Horizon) y saldo en custodia.
// - Escritura (solo si STELLAR_DEMO_SIGNING=1 y están las claves de
//   las cuentas de PRUEBA en el entorno del servidor, p. ej. .env.local):
//   create / accept / deposit / release / refund.
// Nunca usa Mainnet: la red y la passphrase vienen fijas de testnet.json.
// ============================================================

import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { STELLAR, type EtapaAcuerdo } from "@/lib/stellar/config";

if (STELLAR.networkPassphrase !== "Test SDF Network ; September 2015") {
  throw new Error("AgroGlobal solo opera contra Stellar Testnet.");
}

const servidor = new rpc.Server(STELLAR.rpcUrl);
const contrato = new Contract(STELLAR.contractId);

export type EstadoContrato =
  "Created" | "Accepted" | "Funded" | "Released" | "Refunded" | "Cancelled";

export interface AcuerdoEnCadena {
  id: number;
  buyer: string;
  seller: string;
  arbiter: string;
  token: string;
  amount: string;
  termsHash: string;
  orderRef: string;
  deadline: number;
  status: EstadoContrato;
  createdAt: number;
  updatedAt: number;
}

export interface EventoEnCadena {
  nombre: string;
  ledger: number;
  fecha: string;
  txHash: string;
  datos: Record<string, string>;
}

export interface TransaccionVerificada {
  hash: string;
  encontrada: boolean;
  exitosa: boolean;
  ledger?: number;
  fecha?: string;
  cuentaOrigen?: string;
}

// ---------- Utilidades ----------

/** Convierte valores nativos (bigint, Buffer, Address) a strings JSON-seguros. */
function plano(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
  if (Array.isArray(v)) return v.map(plano).join(",");
  if (v && typeof v === "object") return JSON.stringify(v);
  return String(v);
}

async function simular(metodo: string, ...args: xdr.ScVal[]): Promise<xdr.ScVal> {
  // La simulación no requiere firma; la cuenta de origen solo debe existir.
  const tx = new TransactionBuilder(new Account(STELLAR.cuentas.admin, "0"), {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.networkPassphrase,
  })
    .addOperation(contrato.call(metodo, ...args))
    .setTimeout(30)
    .build();
  const sim = await servidor.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  if (!sim.result) throw new Error("La simulación no devolvió resultado");
  return sim.result.retval;
}

const u64 = (n: number) => nativeToScVal(BigInt(n), { type: "u64" });

// ---------- Lectura ----------

export async function leerAcuerdo(id: number): Promise<AcuerdoEnCadena | null> {
  let retval: xdr.ScVal;
  try {
    retval = await simular("get", u64(id));
  } catch (e) {
    // Error #1 del contrato = NotFound
    if (e instanceof Error && /Error\(Contract, #1\)/.test(e.message)) return null;
    throw e;
  }
  const a = scValToNative(retval) as Record<string, unknown>;
  const status = Array.isArray(a["status"]) ? String(a["status"][0]) : String(a["status"]);
  return {
    id,
    buyer: plano(a["buyer"]),
    seller: plano(a["seller"]),
    arbiter: plano(a["arbiter"]),
    token: plano(a["token"]),
    amount: plano(a["amount"]),
    termsHash: plano(a["terms_hash"]),
    orderRef: plano(a["order_ref"]),
    deadline: Number(a["deadline"]),
    status: status as EstadoContrato,
    createdAt: Number(a["created_at"]),
    updatedAt: Number(a["updated_at"]),
  };
}

export async function verificarHashCondiciones(id: number, hashHex: string): Promise<boolean> {
  const r = await simular("verify_terms", u64(id), xdr.ScVal.scvBytes(Buffer.from(hashHex, "hex")));
  return scValToNative(r) === true;
}

export async function saldoEnCustodia(): Promise<string> {
  const token = new Contract(STELLAR.activo.contractId);
  const tx = new TransactionBuilder(new Account(STELLAR.cuentas.admin, "0"), {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.networkPassphrase,
  })
    .addOperation(token.call("balance", new Address(STELLAR.contractId).toScVal()))
    .setTimeout(30)
    .build();
  const sim = await servidor.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result)
    throw new Error("No se pudo consultar el saldo");
  return plano(scValToNative(sim.result.retval));
}

const VENTANA_EVENTOS = 10_000;

/**
 * Eventos del contrato para un acuerdo. Soroban RPC solo conserva los
 * últimos ~7 días y responde vacío a rangos abiertos muy largos, así que
 * se consulta por ventanas acotadas desde el despliegue (o desde el
 * ledger más antiguo retenido) hasta el último.
 */
export async function eventosDelAcuerdo(
  id: number,
): Promise<{ eventos: EventoEnCadena[]; desdeLedger: number; fueraDeRetencion: boolean }> {
  const salud = await servidor.getHealth();
  // +5: el límite inferior avanza mientras se consulta.
  const desdeLedger = Math.max(salud.oldestLedger + 5, STELLAR.deployLedger);
  const eventos: EventoEnCadena[] = [];
  const filtros = [{ type: "contract" as const, contractIds: [STELLAR.contractId] }];
  for (let inicio = desdeLedger; inicio <= salud.latestLedger; inicio += VENTANA_EVENTOS) {
    const fin = Math.min(inicio + VENTANA_EVENTOS, salud.latestLedger + 1);
    const resp = await servidor.getEvents({
      startLedger: inicio,
      endLedger: fin,
      filters: filtros,
      limit: 1000,
    });
    for (const ev of resp.events) {
      const topicos = ev.topic.map((t) => scValToNative(t));
      if (Number(topicos[1]) !== id) continue;
      const valor = scValToNative(ev.value) as unknown;
      const datos: Record<string, string> = {};
      if (valor && typeof valor === "object" && !Array.isArray(valor)) {
        for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
          datos[k] = Array.isArray(v) ? plano(v[0]) : plano(v);
        }
      }
      eventos.push({
        nombre: String(topicos[0]),
        ledger: ev.ledger,
        fecha: ev.ledgerClosedAt,
        txHash: ev.txHash,
        datos,
      });
    }
  }
  return { eventos, desdeLedger, fueraDeRetencion: salud.oldestLedger > STELLAR.deployLedger };
}

/** Verifica hashes de transacción contra Horizon (historial completo de Testnet). */
export async function verificarTransacciones(hashes: string[]): Promise<TransaccionVerificada[]> {
  return Promise.all(
    hashes.map(async (hash) => {
      const r = await fetch(`${"https://horizon-testnet.stellar.org"}/transactions/${hash}`);
      if (r.status === 404) return { hash, encontrada: false, exitosa: false };
      if (!r.ok) throw new Error(`Horizon respondió ${r.status}`);
      const t = (await r.json()) as {
        successful: boolean;
        ledger: number;
        created_at: string;
        source_account: string;
      };
      return {
        hash,
        encontrada: true,
        exitosa: t.successful,
        ledger: t.ledger,
        fecha: t.created_at,
        cuentaOrigen: t.source_account,
      };
    }),
  );
}

// ---------- Escritura (cuentas de prueba) ----------

type Rol = "buyer" | "seller" | "arbiter";

function clave(rol: Rol): Keypair | null {
  const env = {
    buyer: "STELLAR_DEMO_BUYER_SECRET",
    seller: "STELLAR_DEMO_SELLER_SECRET",
    arbiter: "STELLAR_DEMO_ARBITER_SECRET",
  }[rol];
  const secreto = process.env[env];
  if (!secreto) return null;
  const kp = Keypair.fromSecret(secreto);
  // Solo se aceptan las cuentas de prueba registradas en el despliegue.
  if (kp.publicKey() !== STELLAR.cuentas[rol])
    throw new Error(`La clave de ${env} no corresponde a la cuenta de prueba registrada`);
  return kp;
}

/** El servidor solo firma en desarrollo local; un build desplegado (Lovable/Cloudflare/Vercel) nunca firma. */
function entornoLocal(): boolean {
  if (import.meta.env.DEV !== true) return false;
  // Defensa adicional ante un entorno mal configurado.
  return process.env["NODE_ENV"] !== "production";
}

/**
 * true solo para direcciones IP de loopback (127.0.0.0/8, ::1 y su forma
 * IPv4 mapeada). Un nombre como "localhost" NO cuenta: la dirección debe
 * venir del socket, nunca de encabezados que el cliente puede falsificar.
 */
export function esIpLoopback(ip: string | undefined): boolean {
  if (!ip) return false;
  const v = ip.trim().toLowerCase();
  if (v === "::1") return true;
  const v4 = v.startsWith("::ffff:") ? v.slice(7) : v;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4);
}

/**
 * Firma con cuentas de prueba habilitada solo si:
 *  1. el servidor corre en modo desarrollo (`vite dev`), nunca en un build;
 *  2. la IP real del cliente (socket, no `Host` ni `X-Forwarded-For`) es loopback;
 *     si no se conoce, se rechaza;
 *  3. STELLAR_DEMO_SIGNING=1 y las 3 claves corresponden a las cuentas de prueba.
 */
export function firmaHabilitada(ipCliente: string | undefined): boolean {
  if (!entornoLocal()) return false;
  if (!esIpLoopback(ipCliente)) return false;
  if (process.env["STELLAR_DEMO_SIGNING"] !== "1") return false;
  try {
    return !!(clave("buyer") && clave("seller") && clave("arbiter"));
  } catch {
    return false;
  }
}

async function enviar(
  rol: Rol,
  metodo: string,
  args: xdr.ScVal[],
): Promise<{ hash: string; retorno: unknown }> {
  if (!entornoLocal())
    throw new Error("La firma con cuentas de prueba solo existe en desarrollo local");
  const kp = clave(rol);
  if (!kp) throw new Error("Firma de demostración no habilitada en este servidor");
  const cuenta = await servidor.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(cuenta, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.networkPassphrase,
  })
    .addOperation(contrato.call(metodo, ...args))
    .setTimeout(60)
    .build();
  const preparada = await servidor.prepareTransaction(tx);
  preparada.sign(kp);
  const envio = await servidor.sendTransaction(preparada);
  if (envio.status === "ERROR") throw new Error(`La red rechazó la transacción (${envio.hash})`);
  const final = await servidor.pollTransaction(envio.hash, { attempts: 30 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transacción ${envio.hash} no confirmada: ${final.status}`);
  }
  return { hash: envio.hash, retorno: final.returnValue ? scValToNative(final.returnValue) : null };
}

export async function crearAcuerdo(p: {
  montoUnidades: string;
  termsHash: string;
  orderRef: string;
  plazoDias: number;
}): Promise<{ id: number; hash: string }> {
  const deadline = Math.floor(Date.now() / 1000) + p.plazoDias * 86_400;
  const { hash, retorno } = await enviar("buyer", "create", [
    new Address(STELLAR.cuentas.buyer).toScVal(),
    new Address(STELLAR.cuentas.seller).toScVal(),
    new Address(STELLAR.cuentas.arbiter).toScVal(),
    new Address(STELLAR.activo.contractId).toScVal(),
    nativeToScVal(BigInt(p.montoUnidades), { type: "i128" }),
    xdr.ScVal.scvBytes(Buffer.from(p.termsHash, "hex")),
    nativeToScVal(p.orderRef, { type: "string" }),
    u64(deadline),
  ]);
  return { id: Number(retorno), hash };
}

export async function ejecutarEtapa(
  etapa: Exclude<EtapaAcuerdo, "create" | "cancel">,
  id: number,
): Promise<{ hash: string }> {
  switch (etapa) {
    case "accept":
      return enviar("seller", "accept", [u64(id)]);
    case "deposit":
      return enviar("buyer", "deposit", [u64(id)]);
    case "release":
      return enviar("buyer", "release", [u64(id), new Address(STELLAR.cuentas.buyer).toScVal()]);
    case "refund":
      return enviar("arbiter", "refund", [u64(id), new Address(STELLAR.cuentas.arbiter).toScVal()]);
  }
}
