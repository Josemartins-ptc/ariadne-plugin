import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, createOrder, OrderError } from "./orders.ts";
import type { Order, OrderEvent } from "./orders.ts";

const T0 = "2026-05-01T10:00:00.000Z";
const T1 = "2026-05-01T11:00:00.000Z";
const T2 = "2026-05-01T12:00:00.000Z";
const T3 = "2026-05-01T13:00:00.000Z";
const T4 = "2026-05-01T14:00:00.000Z";

function paid(): Order {
  return apply(createOrder("h", 500), { type: "pay", amount: 500 }, T0);
}

function packed(): Order {
  return apply(paid(), { type: "pack" }, T1);
}

function held(from: Order, reason = "fraud check"): Order {
  return apply(from, { type: "holdForReview", reason }, T2);
}

function throwsCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof OrderError, "expected an OrderError");
    assert.equal(err.code, code);
    return true;
  });
}

test("createOrder sets heldFrom and holdReason to null", () => {
  const order = createOrder("h", 1);
  assert.equal(order.heldFrom, null);
  assert.equal(order.holdReason, null);
});

test("holdForReview from paid puts the order on hold", () => {
  const order = held(paid(), "address check");
  assert.equal(order.state, "on_hold");
  assert.equal(order.heldFrom, "paid");
  assert.equal(order.holdReason, "address check");
  assert.deepEqual(order.history.at(-1), { type: "holdForReview", at: T2 });
});

test("holdForReview from packed records packed as heldFrom", () => {
  const order = held(packed());
  assert.equal(order.state, "on_hold");
  assert.equal(order.heldFrom, "packed");
});

test("holdForReview from other states throws invalid_transition", () => {
  throwsCode(() => apply(createOrder("h", 500), { type: "holdForReview", reason: "r" }, T0), "invalid_transition");
  const shipped = apply(packed(), { type: "ship", carrier: "DHL", tracking: "T1" }, T2);
  throwsCode(() => apply(shipped, { type: "holdForReview", reason: "r" }, T3), "invalid_transition");
  const cancelled = apply(paid(), { type: "cancel", reason: "x" }, T1);
  throwsCode(() => apply(cancelled, { type: "holdForReview", reason: "r" }, T2), "invalid_transition");
});

test("holdForReview while already on hold throws invalid_transition", () => {
  throwsCode(() => apply(held(paid()), { type: "holdForReview", reason: "again" }, T3), "invalid_transition");
});

test("approved review returns a paid order to paid and clears the hold", () => {
  const order = apply(held(paid()), { type: "review", approved: true }, T3);
  assert.equal(order.state, "paid");
  assert.equal(order.heldFrom, null);
  assert.equal(order.holdReason, null);
  assert.equal(order.refundDue, false);
  assert.deepEqual(order.history.at(-1), { type: "review", at: T3 });
});

test("approved review returns a packed order to packed and it can then ship", () => {
  const onHold = held(packed());
  assert.equal(onHold.state, "on_hold");
  const order = apply(onHold, { type: "review", approved: true }, T3);
  assert.equal(order.state, "packed");
  const shipped = apply(order, { type: "ship", carrier: "DHL", tracking: "T1" }, T4);
  assert.equal(shipped.state, "shipped");
});

test("rejected review cancels the order with a refund due and the hold reason", () => {
  const order = apply(held(packed(), "stolen card"), { type: "review", approved: false }, T3);
  assert.equal(order.state, "cancelled");
  assert.equal(order.refundDue, true);
  assert.equal(order.cancelReason, "stolen card");
  assert.equal(order.heldFrom, null);
  assert.equal(order.holdReason, null);
  const refunded = apply(order, { type: "refund" }, T4);
  assert.equal(refunded.refundedAt, T4);
  assert.equal(refunded.refundDue, false);
});

test("review outside on_hold throws invalid_transition", () => {
  throwsCode(() => apply(paid(), { type: "review", approved: true }, T1), "invalid_transition");
  throwsCode(() => apply(createOrder("h", 1), { type: "review", approved: false }, T0), "invalid_transition");
});

test("ship is impossible while on hold", () => {
  throwsCode(() => apply(held(packed()), { type: "ship", carrier: "DHL", tracking: "T1" }, T3), "invalid_transition");
});

test("every other event throws invalid_transition while on hold", () => {
  const order = held(paid());
  const events: OrderEvent[] = [
    { type: "pay", amount: 500 },
    { type: "pack" },
    { type: "deliver" },
    { type: "cancel", reason: "x" },
    { type: "requestReturn", reason: "x" },
    { type: "refund" },
  ];
  for (const event of events) {
    throwsCode(() => apply(order, event, T3), "invalid_transition");
  }
});

test("hold and review never mutate the input order", () => {
  const before = packed();
  const snapshot = structuredClone(before);
  const onHold = apply(before, { type: "holdForReview", reason: "r" }, T2);
  assert.deepEqual(before, snapshot);
  const holdSnapshot = structuredClone(onHold);
  apply(onHold, { type: "review", approved: false }, T3);
  apply(onHold, { type: "review", approved: true }, T3);
  assert.deepEqual(onHold, holdSnapshot);
});

test("history records the full held path", () => {
  const order = apply(held(packed()), { type: "review", approved: true }, T3);
  assert.equal(order.state, "packed");
  assert.deepEqual(
    order.history.map((h) => h.type),
    ["pay", "pack", "holdForReview", "review"],
  );
});
