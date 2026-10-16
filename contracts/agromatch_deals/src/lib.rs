#![no_std]
//! AgroMatch COMEX — registro verificable de acuerdos comerciales.
//!
//! El contrato guarda solamente:
//! - `deal_key`: hash (SHA-256) del identificador interno de la operación,
//! - `terms_hash`: hash (SHA-256) de la versión canónica de los términos acordados,
//! - las direcciones públicas Stellar de vendedor y comprador.
//!
//! Nunca recibe precios, nombres, CUIT, documentos ni datos personales. El hash
//! prueba integridad y fecha de registro, no la veracidad del contenido.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    Symbol,
};

const DAY_IN_LEDGERS: u32 = 17_280;
/// 30 días: por debajo del `max_entry_ttl` mínimo de cualquier red pública.
const TTL_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;
const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum DealStatus {
    Created = 0,
    Accepted = 1,
    Cancelled = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deal {
    pub seller: Address,
    pub buyer: Address,
    pub terms_hash: BytesN<32>,
    pub terms_version: u32,
    pub status: DealStatus,
    pub created_at: u64,
    pub updated_at: u64,
    /// 0 mientras el comprador no haya confirmado.
    pub accepted_at: u64,
    pub proof_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proof {
    pub doc_hash: BytesN<32>,
    pub kind: Symbol,
    pub recorded_by: Address,
    pub recorded_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Deal(BytesN<32>),
    Proof(BytesN<32>, u32),
    ProofHash(BytesN<32>, BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    DealAlreadyExists = 1,
    DealNotFound = 2,
    SameParty = 3,
    AlreadyAccepted = 4,
    DealCancelled = 5,
    TermsMismatch = 6,
    InvalidVersion = 7,
    NotParticipant = 8,
    ProofAlreadyRecorded = 9,
    ProofNotFound = 10,
}

/// Evento: el vendedor registró una versión de términos.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealCreated {
    #[topic]
    pub deal_key: BytesN<32>,
    pub seller: Address,
    pub buyer: Address,
    pub terms_hash: BytesN<32>,
    pub terms_version: u32,
}

/// Evento: el vendedor reemplazó los términos antes de la aceptación.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TermsAmended {
    #[topic]
    pub deal_key: BytesN<32>,
    pub terms_hash: BytesN<32>,
    pub terms_version: u32,
}

/// Evento: el comprador designado confirmó la versión indicada.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealAccepted {
    #[topic]
    pub deal_key: BytesN<32>,
    pub buyer: Address,
    pub terms_hash: BytesN<32>,
    pub terms_version: u32,
}

/// Evento: el vendedor retiró un acuerdo no aceptado.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealCancelled {
    #[topic]
    pub deal_key: BytesN<32>,
    pub terms_version: u32,
}

/// Evento: un participante registró la huella de un documento de respaldo.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProofRecorded {
    #[topic]
    pub deal_key: BytesN<32>,
    pub index: u32,
    pub doc_hash: BytesN<32>,
    pub kind: Symbol,
    pub recorded_by: Address,
}

#[contract]
pub struct AgroMatchDeals;

#[contractimpl]
impl AgroMatchDeals {
    /// Registra la versión `terms_version` de un acuerdo. Requiere la firma del vendedor.
    pub fn create_deal(
        env: Env,
        deal_key: BytesN<32>,
        seller: Address,
        buyer: Address,
        terms_hash: BytesN<32>,
        terms_version: u32,
    ) -> Result<(), Error> {
        seller.require_auth();
        if seller == buyer {
            return Err(Error::SameParty);
        }
        if terms_version == 0 {
            return Err(Error::InvalidVersion);
        }
        let key = DataKey::Deal(deal_key.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::DealAlreadyExists);
        }
        let now = env.ledger().timestamp();
        let deal = Deal {
            seller: seller.clone(),
            buyer: buyer.clone(),
            terms_hash: terms_hash.clone(),
            terms_version,
            status: DealStatus::Created,
            created_at: now,
            updated_at: now,
            accepted_at: 0,
            proof_count: 0,
        };
        save_deal(&env, &key, &deal);
        DealCreated {
            deal_key,
            seller,
            buyer,
            terms_hash,
            terms_version,
        }
        .publish(&env);
        Ok(())
    }

    /// Reemplaza los términos por una versión posterior. Solo el vendedor y solo
    /// mientras el comprador no haya aceptado: una versión aceptada es inmutable.
    pub fn amend_terms(
        env: Env,
        deal_key: BytesN<32>,
        terms_hash: BytesN<32>,
        terms_version: u32,
    ) -> Result<(), Error> {
        let key = DataKey::Deal(deal_key.clone());
        let mut deal = load_deal(&env, &key)?;
        deal.seller.require_auth();
        ensure_pending(&deal)?;
        if terms_version <= deal.terms_version {
            return Err(Error::InvalidVersion);
        }
        deal.terms_hash = terms_hash.clone();
        deal.terms_version = terms_version;
        deal.updated_at = env.ledger().timestamp();
        save_deal(&env, &key, &deal);
        TermsAmended {
            deal_key,
            terms_hash,
            terms_version,
        }
        .publish(&env);
        Ok(())
    }

    /// Confirmación del comprador designado. Debe enviar el hash que revisó:
    /// si el vendedor cambió los términos, la aceptación falla con `TermsMismatch`.
    pub fn accept_deal(
        env: Env,
        deal_key: BytesN<32>,
        terms_hash: BytesN<32>,
    ) -> Result<(), Error> {
        let key = DataKey::Deal(deal_key.clone());
        let mut deal = load_deal(&env, &key)?;
        deal.buyer.require_auth();
        ensure_pending(&deal)?;
        if deal.terms_hash != terms_hash {
            return Err(Error::TermsMismatch);
        }
        let now = env.ledger().timestamp();
        deal.status = DealStatus::Accepted;
        deal.accepted_at = now;
        deal.updated_at = now;
        save_deal(&env, &key, &deal);
        DealAccepted {
            deal_key,
            buyer: deal.buyer,
            terms_hash,
            terms_version: deal.terms_version,
        }
        .publish(&env);
        Ok(())
    }

    /// Retira un acuerdo no aceptado. Solo el vendedor.
    pub fn cancel_deal(env: Env, deal_key: BytesN<32>) -> Result<(), Error> {
        let key = DataKey::Deal(deal_key.clone());
        let mut deal = load_deal(&env, &key)?;
        deal.seller.require_auth();
        ensure_pending(&deal)?;
        deal.status = DealStatus::Cancelled;
        deal.updated_at = env.ledger().timestamp();
        save_deal(&env, &key, &deal);
        DealCancelled {
            deal_key,
            terms_version: deal.terms_version,
        }
        .publish(&env);
        Ok(())
    }

    /// Agrega la huella (hash) de un documento de respaldo. Solo vendedor o comprador.
    /// Devuelve el índice asignado a la prueba.
    pub fn record_proof(
        env: Env,
        deal_key: BytesN<32>,
        actor: Address,
        doc_hash: BytesN<32>,
        kind: Symbol,
    ) -> Result<u32, Error> {
        actor.require_auth();
        let key = DataKey::Deal(deal_key.clone());
        let mut deal = load_deal(&env, &key)?;
        if actor != deal.seller && actor != deal.buyer {
            return Err(Error::NotParticipant);
        }
        if deal.status == DealStatus::Cancelled {
            return Err(Error::DealCancelled);
        }
        let dedup_key = DataKey::ProofHash(deal_key.clone(), doc_hash.clone());
        if env.storage().persistent().has(&dedup_key) {
            return Err(Error::ProofAlreadyRecorded);
        }
        let index = deal.proof_count;
        let proof = Proof {
            doc_hash: doc_hash.clone(),
            kind: kind.clone(),
            recorded_by: actor.clone(),
            recorded_at: env.ledger().timestamp(),
        };
        let proof_key = DataKey::Proof(deal_key.clone(), index);
        env.storage().persistent().set(&proof_key, &proof);
        env.storage()
            .persistent()
            .extend_ttl(&proof_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().persistent().set(&dedup_key, &index);
        env.storage()
            .persistent()
            .extend_ttl(&dedup_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        deal.proof_count = index + 1;
        save_deal(&env, &key, &deal);
        ProofRecorded {
            deal_key,
            index,
            doc_hash,
            kind,
            recorded_by: actor,
        }
        .publish(&env);
        Ok(index)
    }

    /// Consulta pública del estado de un acuerdo.
    pub fn get_deal(env: Env, deal_key: BytesN<32>) -> Result<Deal, Error> {
        load_deal(&env, &DataKey::Deal(deal_key))
    }

    /// Consulta pública de una prueba documental por índice.
    pub fn get_proof(env: Env, deal_key: BytesN<32>, index: u32) -> Result<Proof, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Proof(deal_key, index))
            .ok_or(Error::ProofNotFound)
    }
}

fn load_deal(env: &Env, key: &DataKey) -> Result<Deal, Error> {
    env.storage()
        .persistent()
        .get(key)
        .ok_or(Error::DealNotFound)
}

fn save_deal(env: &Env, key: &DataKey, deal: &Deal) {
    env.storage().persistent().set(key, deal);
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn ensure_pending(deal: &Deal) -> Result<(), Error> {
    match deal.status {
        DealStatus::Created => Ok(()),
        DealStatus::Accepted => Err(Error::AlreadyAccepted),
        DealStatus::Cancelled => Err(Error::DealCancelled),
    }
}

#[cfg(test)]
mod test;
