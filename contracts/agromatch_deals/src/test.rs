#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::{
        Address as _, AuthorizedFunction, AuthorizedInvocation, Events, Ledger, MockAuth,
        MockAuthInvoke,
    },
    Address, BytesN, Env, IntoVal, Map, Symbol, TryFromVal, Val,
};

const T0: u64 = 1_760_000_000;

fn hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

fn setup() -> (Env, AgroMatchDealsClient<'static>, Address, Address) {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = T0);
    let contract_id = env.register(AgroMatchDeals, ());
    let client = AgroMatchDealsClient::new(&env, &contract_id);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    (env, client, seller, buyer)
}

#[test]
fn create_deal_requires_seller_auth_and_stores_deal() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    let terms = hash(&env, 2);

    client.create_deal(&key, &seller, &buyer, &terms, &1);

    assert_eq!(
        env.auths(),
        std::vec![(
            seller.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    client.address.clone(),
                    Symbol::new(&env, "create_deal"),
                    (
                        key.clone(),
                        seller.clone(),
                        buyer.clone(),
                        terms.clone(),
                        1u32
                    )
                        .into_val(&env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );

    let deal = client.get_deal(&key);
    assert_eq!(deal.seller, seller);
    assert_eq!(deal.buyer, buyer);
    assert_eq!(deal.terms_hash, terms);
    assert_eq!(deal.terms_version, 1);
    assert_eq!(deal.status, DealStatus::Created);
    assert_eq!(deal.created_at, T0);
    assert_eq!(deal.accepted_at, 0);
    assert_eq!(deal.proof_count, 0);
}

#[test]
fn create_deal_fails_without_seller_signature() {
    let (env, client, seller, buyer) = setup();
    let key = hash(&env, 1);
    let terms = hash(&env, 2);
    // Solo firma el comprador, pero la invocación declara a otra cuenta como vendedora.
    env.mock_auths(&[MockAuth {
        address: &buyer,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "create_deal",
            args: (
                key.clone(),
                seller.clone(),
                buyer.clone(),
                terms.clone(),
                1u32,
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);

    assert!(client
        .try_create_deal(&key, &seller, &buyer, &terms, &1)
        .is_err());
    assert_eq!(client.try_get_deal(&key), Err(Ok(Error::DealNotFound)));
}

#[test]
fn duplicate_deal_key_is_rejected_and_original_is_kept() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    let terms = hash(&env, 2);
    client.create_deal(&key, &seller, &buyer, &terms, &1);

    let other_buyer = Address::generate(&env);
    assert_eq!(
        client.try_create_deal(&key, &seller, &other_buyer, &hash(&env, 3), &1),
        Err(Ok(Error::DealAlreadyExists))
    );
    let deal = client.get_deal(&key);
    assert_eq!(deal.terms_hash, terms);
    assert_eq!(deal.buyer, buyer);
}

#[test]
fn seller_and_buyer_must_differ_and_version_starts_at_one() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    let terms = hash(&env, 2);
    assert_eq!(
        client.try_create_deal(&key, &seller, &seller, &terms, &1),
        Err(Ok(Error::SameParty))
    );
    assert_eq!(
        client.try_create_deal(&key, &seller, &buyer, &terms, &0),
        Err(Ok(Error::InvalidVersion))
    );
}

#[test]
fn buyer_accepts_with_reviewed_hash() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    let terms = hash(&env, 2);
    client.create_deal(&key, &seller, &buyer, &terms, &1);

    env.ledger().with_mut(|li| li.timestamp = T0 + 500);
    client.accept_deal(&key, &terms);

    assert_eq!(
        env.auths(),
        std::vec![(
            buyer.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    client.address.clone(),
                    Symbol::new(&env, "accept_deal"),
                    (key.clone(), terms.clone()).into_val(&env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
    let deal = client.get_deal(&key);
    assert_eq!(deal.status, DealStatus::Accepted);
    assert_eq!(deal.accepted_at, T0 + 500);
    assert_eq!(deal.updated_at, T0 + 500);
    assert_eq!(deal.created_at, T0);
}

#[test]
fn seller_cannot_accept_on_behalf_of_buyer() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    let terms = hash(&env, 2);
    client.create_deal(&key, &seller, &buyer, &terms, &1);

    env.mock_auths(&[MockAuth {
        address: &seller,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "accept_deal",
            args: (key.clone(), terms.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_accept_deal(&key, &terms).is_err());
    assert_eq!(client.get_deal(&key).status, DealStatus::Created);
}

#[test]
fn acceptance_cannot_be_duplicated() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    let terms = hash(&env, 2);
    client.create_deal(&key, &seller, &buyer, &terms, &1);
    client.accept_deal(&key, &terms);
    env.ledger().with_mut(|li| li.timestamp = T0 + 900);

    assert_eq!(
        client.try_accept_deal(&key, &terms),
        Err(Ok(Error::AlreadyAccepted))
    );
    assert_eq!(client.get_deal(&key).accepted_at, T0);
}

#[test]
fn acceptance_with_different_hash_is_rejected() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    client.create_deal(&key, &seller, &buyer, &hash(&env, 2), &1);

    assert_eq!(
        client.try_accept_deal(&key, &hash(&env, 9)),
        Err(Ok(Error::TermsMismatch))
    );
    assert_eq!(client.get_deal(&key).status, DealStatus::Created);
}

#[test]
fn seller_amends_before_acceptance_and_accepted_version_is_immutable() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    let v1 = hash(&env, 2);
    let v2 = hash(&env, 3);
    client.create_deal(&key, &seller, &buyer, &v1, &1);

    assert_eq!(
        client.try_amend_terms(&key, &v2, &1),
        Err(Ok(Error::InvalidVersion))
    );
    client.amend_terms(&key, &v2, &2);
    let deal = client.get_deal(&key);
    assert_eq!(deal.terms_hash, v2);
    assert_eq!(deal.terms_version, 2);

    // El comprador no puede aceptar la versión anterior por error.
    assert_eq!(
        client.try_accept_deal(&key, &v1),
        Err(Ok(Error::TermsMismatch))
    );
    client.accept_deal(&key, &v2);

    assert_eq!(
        client.try_amend_terms(&key, &hash(&env, 4), &3),
        Err(Ok(Error::AlreadyAccepted))
    );
    let deal = client.get_deal(&key);
    assert_eq!(deal.terms_hash, v2);
    assert_eq!(deal.terms_version, 2);
}

#[test]
fn buyer_cannot_amend_terms() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    let v1 = hash(&env, 2);
    let v2 = hash(&env, 3);
    client.create_deal(&key, &seller, &buyer, &v1, &1);

    env.mock_auths(&[MockAuth {
        address: &buyer,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "amend_terms",
            args: (key.clone(), v2.clone(), 2u32).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_amend_terms(&key, &v2, &2).is_err());
    assert_eq!(client.get_deal(&key).terms_hash, v1);
}

#[test]
fn cancelled_deal_cannot_be_accepted_or_cancelled_again() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    let terms = hash(&env, 2);
    client.create_deal(&key, &seller, &buyer, &terms, &1);
    client.cancel_deal(&key);

    assert_eq!(client.get_deal(&key).status, DealStatus::Cancelled);
    assert_eq!(
        client.try_accept_deal(&key, &terms),
        Err(Ok(Error::DealCancelled))
    );
    assert_eq!(client.try_cancel_deal(&key), Err(Ok(Error::DealCancelled)));
}

#[test]
fn accepted_deal_cannot_be_cancelled() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    let terms = hash(&env, 2);
    client.create_deal(&key, &seller, &buyer, &terms, &1);
    client.accept_deal(&key, &terms);
    assert_eq!(
        client.try_cancel_deal(&key),
        Err(Ok(Error::AlreadyAccepted))
    );
}

#[test]
fn participants_record_unique_document_proofs() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    client.create_deal(&key, &seller, &buyer, &hash(&env, 2), &1);

    let invoice = hash(&env, 7);
    let bl = hash(&env, 8);
    assert_eq!(
        client.record_proof(&key, &seller, &invoice, &symbol_short!("invoice")),
        0
    );
    assert_eq!(
        client.try_record_proof(&key, &buyer, &invoice, &symbol_short!("invoice")),
        Err(Ok(Error::ProofAlreadyRecorded))
    );
    let outsider = Address::generate(&env);
    assert_eq!(
        client.try_record_proof(&key, &outsider, &bl, &symbol_short!("bl")),
        Err(Ok(Error::NotParticipant))
    );
    assert_eq!(
        client.record_proof(&key, &buyer, &bl, &symbol_short!("bl")),
        1
    );

    assert_eq!(client.get_deal(&key).proof_count, 2);
    let proof = client.get_proof(&key, &1);
    assert_eq!(proof.doc_hash, bl);
    assert_eq!(proof.recorded_by, buyer);
    assert_eq!(proof.kind, symbol_short!("bl"));
    assert_eq!(
        client.try_get_proof(&key, &5),
        Err(Ok(Error::ProofNotFound))
    );
}

#[test]
fn unknown_deal_returns_not_found() {
    let (env, client, _seller, _buyer) = setup();
    let key = hash(&env, 42);
    assert_eq!(client.try_get_deal(&key), Err(Ok(Error::DealNotFound)));
    env.mock_all_auths();
    assert_eq!(
        client.try_accept_deal(&key, &hash(&env, 1)),
        Err(Ok(Error::DealNotFound))
    );
}

#[test]
fn create_and_accept_emit_events() {
    let (env, client, seller, buyer) = setup();
    env.mock_all_auths();
    let key = hash(&env, 1);
    let terms = hash(&env, 2);

    client.create_deal(&key, &seller, &buyer, &terms, &1);
    let events = env.events().all();
    let (contract, topics, data) = events.last().unwrap();
    assert_eq!(contract, client.address);
    assert_eq!(
        topics,
        (Symbol::new(&env, "deal_created"), key.clone()).into_val(&env)
    );
    let data = Map::<Symbol, Val>::try_from_val(&env, &data).unwrap();
    let event_buyer =
        Address::try_from_val(&env, &data.get(Symbol::new(&env, "buyer")).unwrap()).unwrap();
    let event_hash =
        BytesN::<32>::try_from_val(&env, &data.get(Symbol::new(&env, "terms_hash")).unwrap())
            .unwrap();
    assert_eq!(event_buyer, buyer);
    assert_eq!(event_hash, terms);

    client.accept_deal(&key, &terms);
    let events = env.events().all();
    let (_, topics, data) = events.last().unwrap();
    assert_eq!(
        topics,
        (Symbol::new(&env, "deal_accepted"), key.clone()).into_val(&env)
    );
    let data = Map::<Symbol, Val>::try_from_val(&env, &data).unwrap();
    let version =
        u32::try_from_val(&env, &data.get(Symbol::new(&env, "terms_version")).unwrap()).unwrap();
    assert_eq!(version, 1);
}
