#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, IntoVal, String, Symbol,
};

const MONTO: i128 = 30_000_0000000; // 30.000 unidades con 7 decimales
const DIA: u64 = 86_400;

struct Escenario {
    env: Env,
    escrow: AgroGlobalEscrowClient<'static>,
    token: TokenClient<'static>,
    comprador: Address,
    vendedor: Address,
    arbitro: Address,
    hash: BytesN<32>,
}

fn escenario() -> Escenario {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 1_000_000);

    let emisor = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(emisor);
    let comprador = Address::generate(&env);
    let vendedor = Address::generate(&env);
    let arbitro = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&comprador, &(MONTO * 2));

    let id = env.register(AgroGlobalEscrow, ());
    let hash = BytesN::from_array(&env, &[7u8; 32]);
    Escenario {
        escrow: AgroGlobalEscrowClient::new(&env, &id),
        token: TokenClient::new(&env, &sac.address()),
        comprador,
        vendedor,
        arbitro,
        hash,
        env,
    }
}

fn crear(s: &Escenario) -> u64 {
    s.escrow.create(
        &s.comprador,
        &s.vendedor,
        &s.arbitro,
        &s.token.address,
        &MONTO,
        &s.hash,
        &String::from_str(&s.env, "OC-2026-0001"),
        &(s.env.ledger().timestamp() + 30 * DIA),
    )
}

fn crear_y_fondear(s: &Escenario) -> u64 {
    let id = crear(s);
    s.escrow.accept(&id);
    s.escrow.deposit(&id);
    id
}

#[test]
fn flujo_completo_libera_fondos_al_vendedor() {
    let s = escenario();
    let id = crear(&s);
    assert_eq!(id, 0);
    assert_eq!(s.escrow.count(), 1);
    assert_eq!(s.escrow.get(&id).status, Status::Created);

    s.escrow.accept(&id);
    assert_eq!(s.escrow.get(&id).status, Status::Accepted);

    s.escrow.deposit(&id);
    assert_eq!(s.escrow.get(&id).status, Status::Funded);
    assert_eq!(s.token.balance(&s.escrow.address), MONTO);
    assert_eq!(s.token.balance(&s.comprador), MONTO);

    s.escrow.release(&id, &s.comprador);
    let a = s.escrow.get(&id);
    assert_eq!(a.status, Status::Released);
    assert_eq!(s.token.balance(&s.vendedor), MONTO);
    assert_eq!(s.token.balance(&s.escrow.address), 0);
}

#[test]
fn cada_paso_exige_la_firma_correcta() {
    let s = escenario();
    let id = crear(&s);
    assert_eq!(
        s.env.auths()[0],
        (
            s.comprador.clone(),
            soroban_sdk::testutils::AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    s.escrow.address.clone(),
                    Symbol::new(&s.env, "create"),
                    (
                        s.comprador.clone(),
                        s.vendedor.clone(),
                        s.arbitro.clone(),
                        s.token.address.clone(),
                        MONTO,
                        s.hash.clone(),
                        String::from_str(&s.env, "OC-2026-0001"),
                        s.env.ledger().timestamp() + 30 * DIA,
                    )
                        .into_val(&s.env),
                )),
                sub_invocations: std::vec![],
            }
        )
    );

    s.escrow.accept(&id);
    assert_eq!(s.env.auths()[0].0, s.vendedor);

    s.escrow.deposit(&id);
    assert_eq!(s.env.auths()[0].0, s.comprador);

    s.escrow.release(&id, &s.arbitro);
    assert_eq!(s.env.auths()[0].0, s.arbitro);
}

#[test]
#[should_panic]
fn sin_firma_del_vendedor_no_se_acepta() {
    let s = escenario();
    let id = crear(&s);
    s.env.set_auths(&[]);
    s.escrow.accept(&id);
}

#[test]
fn hash_de_condiciones_verificable() {
    let s = escenario();
    let id = crear(&s);
    assert!(s.escrow.verify_terms(&id, &s.hash));
    assert!(!s.escrow.verify_terms(&id, &BytesN::from_array(&s.env, &[8u8; 32])));
}

#[test]
fn no_se_deposita_sin_aceptacion_del_vendedor() {
    let s = escenario();
    let id = crear(&s);
    assert_eq!(s.escrow.try_deposit(&id), Err(Ok(Error::InvalidStatus)));
    assert_eq!(s.token.balance(&s.comprador), MONTO * 2);
}

#[test]
fn no_se_libera_dos_veces() {
    let s = escenario();
    let id = crear_y_fondear(&s);
    s.escrow.release(&id, &s.comprador);
    assert_eq!(s.escrow.try_release(&id, &s.comprador), Err(Ok(Error::InvalidStatus)));
    assert_eq!(s.escrow.try_refund(&id, &s.arbitro), Err(Ok(Error::InvalidStatus)));
    assert_eq!(s.token.balance(&s.vendedor), MONTO);
}

#[test]
fn no_se_deposita_dos_veces() {
    let s = escenario();
    let id = crear_y_fondear(&s);
    assert_eq!(s.escrow.try_deposit(&id), Err(Ok(Error::InvalidStatus)));
    assert_eq!(s.token.balance(&s.escrow.address), MONTO);
}

#[test]
fn el_vendedor_o_un_tercero_no_pueden_liberar() {
    let s = escenario();
    let id = crear_y_fondear(&s);
    let tercero = Address::generate(&s.env);
    assert_eq!(s.escrow.try_release(&id, &s.vendedor), Err(Ok(Error::Unauthorized)));
    assert_eq!(s.escrow.try_release(&id, &tercero), Err(Ok(Error::Unauthorized)));
    assert_eq!(s.escrow.get(&id).status, Status::Funded);
}

#[test]
fn arbitro_puede_reembolsar_en_cualquier_momento() {
    let s = escenario();
    let id = crear_y_fondear(&s);
    s.escrow.refund(&id, &s.arbitro);
    assert_eq!(s.escrow.get(&id).status, Status::Refunded);
    assert_eq!(s.token.balance(&s.comprador), MONTO * 2);
}

#[test]
fn comprador_solo_reembolsa_despues_del_vencimiento() {
    let s = escenario();
    let id = crear_y_fondear(&s);
    assert_eq!(s.escrow.try_refund(&id, &s.comprador), Err(Ok(Error::DeadlineNotReached)));

    s.env.ledger().with_mut(|l| l.timestamp += 31 * DIA);
    s.escrow.refund(&id, &s.comprador);
    assert_eq!(s.escrow.get(&id).status, Status::Refunded);
    assert_eq!(s.token.balance(&s.comprador), MONTO * 2);
}

#[test]
fn cancelacion_solo_sin_fondos() {
    let s = escenario();
    let id = crear(&s);
    s.escrow.cancel(&id, &s.vendedor);
    assert_eq!(s.escrow.get(&id).status, Status::Cancelled);
    assert_eq!(s.escrow.try_accept(&id), Err(Ok(Error::InvalidStatus)));

    let id2 = crear_y_fondear(&s);
    assert_eq!(s.escrow.try_cancel(&id2, &s.comprador), Err(Ok(Error::InvalidStatus)));
    assert_eq!(s.escrow.try_cancel(&id2, &s.arbitro), Err(Ok(Error::Unauthorized)));
}

#[test]
fn validaciones_de_creacion() {
    let s = escenario();
    let ref_ = String::from_str(&s.env, "OC-X");
    let ahora = s.env.ledger().timestamp();
    assert_eq!(
        s.escrow.try_create(&s.comprador, &s.vendedor, &s.arbitro, &s.token.address, &0, &s.hash, &ref_, &(ahora + DIA)),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.escrow.try_create(&s.comprador, &s.vendedor, &s.arbitro, &s.token.address, &-5, &s.hash, &ref_, &(ahora + DIA)),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.escrow.try_create(&s.comprador, &s.comprador, &s.arbitro, &s.token.address, &MONTO, &s.hash, &ref_, &(ahora + DIA)),
        Err(Ok(Error::SameParty))
    );
    assert_eq!(
        s.escrow.try_create(&s.comprador, &s.vendedor, &s.arbitro, &s.token.address, &MONTO, &s.hash, &ref_, &ahora),
        Err(Ok(Error::DeadlineInPast))
    );
    assert_eq!(s.escrow.count(), 0);
}

#[test]
fn acuerdo_inexistente() {
    let s = escenario();
    assert_eq!(s.escrow.try_get(&99), Err(Ok(Error::NotFound)));
    assert_eq!(s.escrow.try_accept(&99), Err(Ok(Error::NotFound)));
}

#[test]
fn deposito_sin_saldo_falla_y_no_cambia_estado() {
    let s = escenario();
    let pobre = Address::generate(&s.env);
    let id = s.escrow.create(
        &pobre,
        &s.vendedor,
        &s.arbitro,
        &s.token.address,
        &MONTO,
        &s.hash,
        &String::from_str(&s.env, "OC-SIN-SALDO"),
        &(s.env.ledger().timestamp() + DIA),
    );
    s.escrow.accept(&id);
    assert!(s.escrow.try_deposit(&id).is_err());
    assert_eq!(s.escrow.get(&id).status, Status::Accepted);
}
