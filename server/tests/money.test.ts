import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toCents,
  fromCents,
  MIN_BET_CENTS,
  MAX_BET_CENTS,
  MAX_PAYOUT_CENTS,
} from "../src/money.ts";
import { HttpError } from "../src/http/errors.ts";

function is400(err: unknown): boolean {
  return err instanceof HttpError && err.status === 400;
}

test("toCents accepte un nombre, une chaîne et la virgule française", () => {
  assert.equal(toCents(12.5), 1250);
  assert.equal(toCents("12.5"), 1250);
  assert.equal(toCents("12,50"), 1250);
  assert.equal(toCents(" 1 000 "), 100000);
});

test("toCents refuse plus de deux décimales", () => {
  assert.throws(() => toCents("0.001"), is400);
  assert.throws(() => toCents("10.005"), is400);
  assert.throws(() => toCents(10.005), is400);
});

test("toCents absorbe le bruit des flottants", () => {
  // 1 + 0.1 + 0.2 = 1.3000000000000003 en binaire : ça vaut 130 centimes.
  assert.equal(toCents(1 + 0.1 + 0.2), 130);
  assert.equal(toCents(0.1 + 0.2 + 9.7), 1000);
});

test("toCents applique les bornes de mise", () => {
  assert.equal(toCents(1), MIN_BET_CENTS);
  assert.equal(toCents(1000), MAX_BET_CENTS);
  assert.throws(() => toCents(0.99), is400);
  assert.throws(() => toCents(1000.01), is400);
  assert.throws(() => toCents(-5), is400);
});

test("toCents refuse ce qui n'est pas un montant fini", () => {
  assert.throws(() => toCents(Number.NaN), is400);
  assert.throws(() => toCents(Number.POSITIVE_INFINITY), is400);
  assert.throws(() => toCents("abc"), is400);
  assert.throws(() => toCents(""), is400);
  assert.throws(() => toCents(null), is400);
  assert.throws(() => toCents(undefined), is400);
  assert.throws(() => toCents({}), is400);
});

test("fromCents formate toujours deux décimales", () => {
  assert.equal(fromCents(1250), "12.50");
  assert.equal(fromCents(100000), "1000.00");
  assert.equal(fromCents(5), "0.05");
  assert.equal(fromCents(0), "0.00");
});

test("les plafonds sont ceux de la spec", () => {
  assert.equal(MIN_BET_CENTS, 100);
  assert.equal(MAX_BET_CENTS, 100_000);
  assert.equal(MAX_PAYOUT_CENTS, 1_000_000);
});
