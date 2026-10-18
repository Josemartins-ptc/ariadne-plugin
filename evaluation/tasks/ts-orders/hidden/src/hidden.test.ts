import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, createOrder, OrderError } from "./orders.ts";
import type { Order, OrderEvent } from "./orders.ts";

const T0 = "2026-03-01T10:00:00.000Z";
const T1 = "2026-03-01T11:00:00.000Z";
const T2 = "2026-03-02T09:00:00.000Z";
const T3 = "2026-03-04T15:30:00.000Z";
const T4 = "2026-03-05T08:00:00.000Z";
const T5 = "2026-03-06T08:00:00.000Z";

function run(order: Order, steps: Array<[OrderEvent, string]>): Order {
  let current = order;
  for (const [event, at] of steps) current = apply(current, event, at);
  return current;
}

function paid(total = 100): Order {
  return run(createOrder("o", total), [[{ type: "pay", amount: total }, T0]]);
}

function packed(total = 100): Order {
  return run(paid(total), [[{ type: "pack" }, T1]]);
}

function shipped(total = 100): Order {
  return run(packed(total), [[{ type: "ship", carrier: "DHL", tracking: "JD0001" }, T2]]);
}

function delivered(at = T3, total = 100): Order {
  return run(shipped(total), [[{ type: "deliver" }, at]]);
}

function throwsCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof OrderError, "expected an OrderError");
    assert.ok(err instanceof Error, "OrderError extends Error");
    assert.equal(err.code, code);
    return true;
  });
}

test("createOrder returns a created order with null fields and empty history", () => {
  const order = createOrder("abc", 1234);
  assert.equal(order.id, "abc");
  assert.equal(order.state, "created");
  assert.equal(order.total, 1234);
  assert.deepEqual(order.history, []);
  assert.equal(order.refundDue, false);
  for (const key of ["paidAt", "carrier", "tracking", "deliveredAt", "cancelReason", "returnReason", "refundedAt"] as const) {
    assert.equal(order[key], null, key);
  }
});

test("OrderError has name OrderError and its code", () => {
  const err = new OrderError("amount_mismatch", "boom");
  assert.equal(err.name, "OrderError");
  assert.equal(err.code, "amount_mismatch");
  assert.equal(err.message, "boom");
  assert.ok(err instanceof Error);
});

test("pay with a different amount throws amount_mismatch", () => {
  throwsCode(() => apply(createOrder("o", 100), { type: "pay", amount: 99.99 }, T0), "amount_mismatch");
});

test("pay on an already paid order throws invalid_transition even with a wrong amount", () => {
  throwsCode(() => apply(paid(), { type: "pay", amount: 1 }, T1), "invalid_transition");
  throwsCode(() => apply(paid(), { type: "pay", amount: 100 }, T1), "invalid_transition");
});

test("pack is only allowed from paid", () => {
  throwsCode(() => apply(createOrder("o", 100), { type: "pack" }, T0), "invalid_transition");
  throwsCode(() => apply(packed(), { type: "pack" }, T2), "invalid_transition");
  const result = apply(paid(), { type: "pack" }, T1);
  assert.equal(result.state, "packed");
});

test("ship is only allowed from packed", () => {
  throwsCode(() => apply(paid(), { type: "ship", carrier: "DHL", tracking: "X" }, T1), "invalid_transition");
  throwsCode(() => apply(shipped(), { type: "ship", carrier: "DHL", tracking: "X" }, T3), "invalid_transition");
});

test("ship with an empty or whitespace carrier throws missing_carrier, checked before tracking", () => {
  throwsCode(() => apply(packed(), { type: "ship", carrier: "", tracking: "X1" }, T2), "missing_carrier");
  throwsCode(() => apply(packed(), { type: "ship", carrier: "  \t", tracking: "X1" }, T2), "missing_carrier");
  throwsCode(() => apply(packed(), { type: "ship", carrier: "", tracking: "" }, T2), "missing_carrier");
});

test("ship with a whitespace-only tracking throws missing_tracking", () => {
  throwsCode(() => apply(packed(), { type: "ship", carrier: "DHL", tracking: "   " }, T2), "missing_tracking");
});

test("ship stores carrier and tracking exactly as given", () => {
  const result = apply(packed(), { type: "ship", carrier: " DHL ", tracking: " JD 01 " }, T2);
  assert.equal(result.state, "shipped");
  assert.equal(result.carrier, " DHL ");
  assert.equal(result.tracking, " JD 01 ");
});

test("deliver is only allowed from shipped and sets deliveredAt", () => {
  throwsCode(() => apply(packed(), { type: "deliver" }, T3), "invalid_transition");
  throwsCode(() => apply(delivered(), { type: "deliver" }, T4), "invalid_transition");
  const result = apply(shipped(), { type: "deliver" }, T3);
  assert.equal(result.state, "delivered");
  assert.equal(result.deliveredAt, T3);
});

test("cancelling an unpaid order does not make a refund due", () => {
  const result = apply(createOrder("o", 100), { type: "cancel", reason: "changed mind" }, T0);
  assert.equal(result.state, "cancelled");
  assert.equal(result.cancelReason, "changed mind");
  assert.equal(result.refundDue, false);
});

test("cancelling a paid order makes a refund due", () => {
  const result = apply(paid(), { type: "cancel", reason: "too slow" }, T1);
  assert.equal(result.state, "cancelled");
  assert.equal(result.refundDue, true);
  assert.equal(result.paidAt, T0);
});

test("cancelling a packed order makes a refund due", () => {
  const result = apply(packed(), { type: "cancel", reason: "x" }, T2);
  assert.equal(result.state, "cancelled");
  assert.equal(result.refundDue, true);
});

test("cancel after shipping, delivery or cancellation throws invalid_transition", () => {
  throwsCode(() => apply(shipped(), { type: "cancel", reason: "x" }, T3), "invalid_transition");
  throwsCode(() => apply(delivered(), { type: "cancel", reason: "x" }, T4), "invalid_transition");
  const cancelled = apply(createOrder("o", 100), { type: "cancel", reason: "x" }, T0);
  throwsCode(() => apply(cancelled, { type: "cancel", reason: "y" }, T1), "invalid_transition");
});

test("requestReturn within the window returns the order and makes a refund due", () => {
  const result = apply(delivered(T3), { type: "requestReturn", reason: "broken" }, T5);
  assert.equal(result.state, "returned");
  assert.equal(result.returnReason, "broken");
  assert.equal(result.refundDue, true);
});

test("requestReturn exactly 30 days after delivery is allowed", () => {
  const result = apply(
    delivered("2026-03-04T15:30:00.000Z"),
    { type: "requestReturn", reason: "late" },
    "2026-04-03T15:30:00.000Z",
  );
  assert.equal(result.state, "returned");
});

test("requestReturn one millisecond past 30 days throws return_window_closed", () => {
  throwsCode(
    () => apply(delivered("2026-03-04T15:30:00.000Z"), { type: "requestReturn", reason: "late" }, "2026-04-03T15:30:00.001Z"),
    "return_window_closed",
  );
});

test("return window compares instants, not calendar dates or strings", () => {
  // 30 days later on the clock, but the later timestamp is in a +02:00 offset: 2 hours earlier as an instant.
  const ok = apply(delivered("2026-03-04T15:30:00.000Z"), { type: "requestReturn", reason: "r" }, "2026-04-03T17:00:00.000+02:00");
  assert.equal(ok.state, "returned");
  throwsCode(
    () => apply(delivered("2026-03-04T15:30:00.000Z"), { type: "requestReturn", reason: "r" }, "2026-04-03T16:00:00.000Z"),
    "return_window_closed",
  );
});

test("requestReturn is only allowed from delivered", () => {
  throwsCode(() => apply(shipped(), { type: "requestReturn", reason: "r" }, T3), "invalid_transition");
  const returned = apply(delivered(), { type: "requestReturn", reason: "r" }, T4);
  throwsCode(() => apply(returned, { type: "requestReturn", reason: "r" }, T5), "invalid_transition");
});

test("refund of a cancelled paid order sets refundedAt and clears refundDue", () => {
  const cancelled = apply(paid(), { type: "cancel", reason: "x" }, T1);
  const result = apply(cancelled, { type: "refund" }, T2);
  assert.equal(result.state, "cancelled");
  assert.equal(result.refundDue, false);
  assert.equal(result.refundedAt, T2);
});

test("refund of a returned order keeps the state returned", () => {
  const returned = apply(delivered(), { type: "requestReturn", reason: "r" }, T4);
  const result = apply(returned, { type: "refund" }, T5);
  assert.equal(result.state, "returned");
  assert.equal(result.refundDue, false);
  assert.equal(result.refundedAt, T5);
});

test("refunding twice throws already_refunded", () => {
  const cancelled = apply(packed(), { type: "cancel", reason: "x" }, T2);
  const refunded = apply(cancelled, { type: "refund" }, T3);
  throwsCode(() => apply(refunded, { type: "refund" }, T4), "already_refunded");
  const returned = apply(delivered(), { type: "requestReturn", reason: "r" }, T4);
  const refundedReturn = apply(returned, { type: "refund" }, T5);
  throwsCode(() => apply(refundedReturn, { type: "refund" }, T5), "already_refunded");
});

test("refund of an order cancelled before payment throws invalid_transition", () => {
  const cancelled = apply(createOrder("o", 100), { type: "cancel", reason: "x" }, T0);
  throwsCode(() => apply(cancelled, { type: "refund" }, T1), "invalid_transition");
});

test("refund from states other than cancelled or returned throws invalid_transition", () => {
  throwsCode(() => apply(createOrder("o", 100), { type: "refund" }, T0), "invalid_transition");
  throwsCode(() => apply(paid(), { type: "refund" }, T1), "invalid_transition");
  throwsCode(() => apply(delivered(), { type: "refund" }, T4), "invalid_transition");
});

test("every successful event appends type and now to history in order", () => {
  const cancelled = run(createOrder("o", 100), [
    [{ type: "pay", amount: 100 }, T0],
    [{ type: "pack" }, T1],
    [{ type: "cancel", reason: "x" }, T2],
    [{ type: "refund" }, T3],
  ]);
  assert.deepEqual(cancelled.history, [
    { type: "pay", at: T0 },
    { type: "pack", at: T1 },
    { type: "cancel", at: T2 },
    { type: "refund", at: T3 },
  ]);
  const returned = run(delivered(T3), [
    [{ type: "requestReturn", reason: "r" }, T4],
    [{ type: "refund" }, T5],
  ]);
  assert.deepEqual(
    returned.history.map((h) => [h.type, h.at]),
    [["pay", T0], ["pack", T1], ["ship", T2], ["deliver", T3], ["requestReturn", T4], ["refund", T5]],
  );
});

test("apply never mutates the input order or its history", () => {
  const before = packed();
  const snapshot = structuredClone(before);
  const historyRef = before.history;
  const after = apply(before, { type: "ship", carrier: "DHL", tracking: "X" }, T2);
  assert.notEqual(after, before);
  assert.notEqual(after.history, historyRef);
  assert.deepEqual(before, snapshot);
  assert.equal(historyRef.length, 2);
});

test("a failed event leaves the input order unchanged", () => {
  const before = packed();
  const snapshot = structuredClone(before);
  assert.throws(() => apply(before, { type: "ship", carrier: "DHL", tracking: "" }, T2));
  assert.throws(() => apply(before, { type: "deliver" }, T2));
  assert.deepEqual(before, snapshot);
});

test("fields not touched by an event are carried over", () => {
  const result = delivered(T3, 4200);
  assert.equal(result.id, "o");
  assert.equal(result.total, 4200);
  assert.equal(result.paidAt, T0);
  assert.equal(result.carrier, "DHL");
  assert.equal(result.tracking, "JD0001");
  assert.equal(result.cancelReason, null);
  assert.equal(result.refundDue, false);
  assert.equal(result.refundedAt, null);
});
