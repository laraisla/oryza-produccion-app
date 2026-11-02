#![no_std]
//! AgroGlobal COMEX — Acuerdo comercial con depósito en garantía (Soroban).
//!
//! Solo para Stellar Testnet y activos de prueba. Ciclo de vida:
//!
//!   create (comprador) → accept (vendedor) → deposit (comprador)
//!     → release (comprador o árbitro)  : fondos al vendedor
//!     → refund  (árbitro; o comprador tras el vencimiento) : fondos al comprador
//!   cancel (comprador o vendedor) solo mientras no haya fondos depositados.
//!
//! Las condiciones comerciales nunca se guardan en la cadena: solo su
//! hash SHA-256 (`terms_hash`), calculado fuera de la cadena sobre el
//! documento canónico de la orden. Cualquiera puede verificarlo con
//! `verify_terms`.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN,
    Env, String,
};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    Created,
    Accepted,
    Funded,
    Released,
    Refunded,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Agreement {
    pub buyer: Address,
    pub seller: Address,
    pub arbiter: Address,
    pub token: Address,
    pub amount: i128,
    pub terms_hash: BytesN<32>,
    /// Referencia de la orden en AgroGlobal (por ejemplo "OC-2026-0001").
    pub order_ref: String,
    /// Marca de tiempo (segundos) a partir de la cual el comprador puede
    /// recuperar los fondos si no fueron liberados.
    pub deadline: u64,
    pub status: Status,
    pub created_at: u64,
    pub updated_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    NextId,
    Agreement(u64),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotFound = 1,
    InvalidAmount = 2,
    InvalidStatus = 3,
    Unauthorized = 4,
    DeadlineInPast = 5,
    DeadlineNotReached = 6,
    SameParty = 7,
}

// ---- Eventos (consultables desde el explorador y Soroban RPC) ----

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgreementCreated {
    #[topic]
    pub id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub terms_hash: BytesN<32>,
    pub order_ref: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StatusChanged {
    #[topic]
    pub id: u64,
    pub status: Status,
    pub by: Address,
}

// ~30 días de ledgers (5 s c/u): las entradas se renuevan en cada escritura.
const TTL_THRESHOLD: u32 = 17_280 * 7;
const TTL_EXTEND_TO: u32 = 17_280 * 30;

#[contract]
pub struct AgroGlobalEscrow;

#[contractimpl]
impl AgroGlobalEscrow {
    /// Crea un acuerdo. Lo firma el comprador.
    #[allow(clippy::too_many_arguments)]
    pub fn create(
        env: Env,
        buyer: Address,
        seller: Address,
        arbiter: Address,
        token: Address,
        amount: i128,
        terms_hash: BytesN<32>,
        order_ref: String,
        deadline: u64,
    ) -> Result<u64, Error> {
        buyer.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if buyer == seller {
            return Err(Error::SameParty);
        }
        let now = env.ledger().timestamp();
        if deadline <= now {
            return Err(Error::DeadlineInPast);
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        let agreement = Agreement {
            buyer: buyer.clone(),
            seller: seller.clone(),
            arbiter,
            token,
            amount,
            terms_hash: terms_hash.clone(),
            order_ref: order_ref.clone(),
            deadline,
            status: Status::Created,
            created_at: now,
            updated_at: now,
        };
        save(&env, id, &agreement);

        AgreementCreated { id, buyer, seller, amount, terms_hash, order_ref }.publish(&env);
        Ok(id)
    }

    /// El vendedor acepta las condiciones (mismo hash). Lo firma el vendedor.
    pub fn accept(env: Env, id: u64) -> Result<(), Error> {
        let mut a = load(&env, id)?;
        a.seller.require_auth();
        if a.status != Status::Created {
            return Err(Error::InvalidStatus);
        }
        let by = a.seller.clone();
        transition(&env, id, &mut a, Status::Accepted, by);
        Ok(())
    }

    /// El comprador deposita el monto en garantía (custodia del contrato).
    pub fn deposit(env: Env, id: u64) -> Result<(), Error> {
        let mut a = load(&env, id)?;
        a.buyer.require_auth();
        if a.status != Status::Accepted {
            return Err(Error::InvalidStatus);
        }
        token::TokenClient::new(&env, &a.token).transfer(
            &a.buyer,
            &env.current_contract_address(),
            &a.amount,
        );
        let by = a.buyer.clone();
        transition(&env, id, &mut a, Status::Funded, by);
        Ok(())
    }

    /// Libera los fondos al vendedor. Puede hacerlo el comprador (conformidad
    /// de entrega) o el árbitro.
    pub fn release(env: Env, id: u64, by: Address) -> Result<(), Error> {
        let mut a = load(&env, id)?;
        if by != a.buyer && by != a.arbiter {
            return Err(Error::Unauthorized);
        }
        by.require_auth();
        if a.status != Status::Funded {
            return Err(Error::InvalidStatus);
        }
        token::TokenClient::new(&env, &a.token).transfer(
            &env.current_contract_address(),
            &a.seller,
            &a.amount,
        );
        transition(&env, id, &mut a, Status::Released, by);
        Ok(())
    }

    /// Devuelve los fondos al comprador. El árbitro puede hacerlo en cualquier
    /// momento; el comprador solo después del vencimiento.
    pub fn refund(env: Env, id: u64, by: Address) -> Result<(), Error> {
        let mut a = load(&env, id)?;
        if by != a.buyer && by != a.arbiter {
            return Err(Error::Unauthorized);
        }
        by.require_auth();
        if a.status != Status::Funded {
            return Err(Error::InvalidStatus);
        }
        if by == a.buyer && by != a.arbiter && env.ledger().timestamp() < a.deadline {
            return Err(Error::DeadlineNotReached);
        }
        token::TokenClient::new(&env, &a.token).transfer(
            &env.current_contract_address(),
            &a.buyer,
            &a.amount,
        );
        transition(&env, id, &mut a, Status::Refunded, by);
        Ok(())
    }

    /// Cancela un acuerdo sin fondos. Comprador o vendedor.
    pub fn cancel(env: Env, id: u64, by: Address) -> Result<(), Error> {
        let mut a = load(&env, id)?;
        if by != a.buyer && by != a.seller {
            return Err(Error::Unauthorized);
        }
        by.require_auth();
        if a.status != Status::Created && a.status != Status::Accepted {
            return Err(Error::InvalidStatus);
        }
        transition(&env, id, &mut a, Status::Cancelled, by);
        Ok(())
    }

    pub fn get(env: Env, id: u64) -> Result<Agreement, Error> {
        load(&env, id)
    }

    pub fn verify_terms(env: Env, id: u64, terms_hash: BytesN<32>) -> Result<bool, Error> {
        Ok(load(&env, id)?.terms_hash == terms_hash)
    }

    pub fn count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }
}

fn load(env: &Env, id: u64) -> Result<Agreement, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Agreement(id))
        .ok_or(Error::NotFound)
}

fn save(env: &Env, id: u64, a: &Agreement) {
    let key = DataKey::Agreement(id);
    env.storage().persistent().set(&key, a);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn transition(env: &Env, id: u64, a: &mut Agreement, status: Status, by: Address) {
    a.status = status;
    a.updated_at = env.ledger().timestamp();
    save(env, id, a);
    StatusChanged { id, status, by }.publish(env);
}

mod test;
