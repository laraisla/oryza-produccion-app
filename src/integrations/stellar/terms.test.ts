import { describe, expect, it } from 'vitest';
import { canonicalJson, dealKeyFor, sha256Hex, termsHashFor } from './terms';

describe('hash canónico de términos', () => {
  it('ordena claves, omite undefined y no depende del orden de inserción', () => {
    expect(canonicalJson({ b: '1', a: { d: true, c: null }, z: undefined })).toBe('{"a":{"c":null,"d":true},"b":"1"}');
    expect(canonicalJson({ a: '1', b: '2' })).toBe(canonicalJson({ b: '2', a: '1' }));
  });

  it('rechaza decimales binarios: los importes viajan como strings', () => {
    expect(() => canonicalJson({ price: 0.1 })).toThrow(/usar string/);
    expect(canonicalJson({ qty: 40 })).toBe('{"qty":40}');
  });

  it('SHA-256 conocido y claves de operación estables', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await dealKeyFor('op-1')).toBe(await dealKeyFor('op-1'));
    expect(await dealKeyFor('op-1')).not.toBe(await dealKeyFor('op-2'));
    expect(await termsHashFor({ a: '1', b: '2' })).toBe(await termsHashFor({ b: '2', a: '1' }));
    expect(await termsHashFor({ a: '1' })).not.toBe(await termsHashFor({ a: '2' }));
  });
});
