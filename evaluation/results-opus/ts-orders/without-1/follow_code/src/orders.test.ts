import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, createOrder, OrderError } from "./orders.ts";

test("paying the exact total moves a created order to paid", () => {
  const order = createOrder("o-1", 4999);
  const paid = apply(order, { type: "pay", amount: 4999 }, "2026-03-01T10:00:00.000Z");
  assert.equal(paid.state, "paid");
  assert.equal(paid.paidAt, "2026-03-01T10:00:00.000Z");
  assert.deepEqual(paid.history, [{ type: "pay", at: "2026-03-01T10:00:00.000Z" }]);
  assert.equal(order.state, "created");
});

test("shipping without a tracking number is rejected", () => {
  let order = createOrder("o-2", 100);
  order = apply(order, { type: "pay", amount: 100 }, "2026-03-01T10:00:00.000Z");
  order = apply(order, { type: "pack" }, "2026-03-01T11:00:00.000Z");
  const packed = order;
  assert.throws(
    () => apply(packed, { type: "ship", carrier: "DHL", tracking: "" }, "2026-03-01T12:00:00.000Z"),
    (err: unknown) => err instanceof OrderError && err.code === "missing_tracking",
  );
});

test("an order can go from created to delivered", () => {
  let order = createOrder("o-3", 250);
  order = apply(order, { type: "pay", amount: 250 }, "2026-03-01T10:00:00.000Z");
  order = apply(order, { type: "pack" }, "2026-03-01T11:00:00.000Z");
  order = apply(order, { type: "ship", carrier: "UPS", tracking: "1Z999" }, "2026-03-02T09:00:00.000Z");
  order = apply(order, { type: "deliver" }, "2026-03-04T15:30:00.000Z");
  assert.equal(order.state, "delivered");
  assert.equal(order.carrier, "UPS");
  assert.equal(order.tracking, "1Z999");
  assert.equal(order.deliveredAt, "2026-03-04T15:30:00.000Z");
  assert.deepEqual(
    order.history.map((h) => h.type),
    ["pay", "pack", "ship", "deliver"],
  );
});

const T0 = "2026-03-01T10:00:00.000Z";
const T1 = "2026-03-01T11:00:00.000Z";
const T2 = "2026-03-01T12:00:00.000Z";
const T3 = "2026-03-01T13:00:00.000Z";

function paidOrder(id: string) {
  return apply(createOrder(id, 100), { type: "pay", amount: 100 }, T0);
}

function packedOrder(id: string) {
  return apply(paidOrder(id), { type: "pack" }, T1);
}

function isInvalidTransition(err: unknown): boolean {
  return err instanceof OrderError && err.code === "invalid_transition";
}

test("createOrder starts with no hold", () => {
  const order = createOrder("h-0", 100);
  assert.equal(order.heldFrom, null);
  assert.equal(order.holdReason, null);
});

test("holding a paid order records where it was held from", () => {
  const paid = paidOrder("h-1");
  const held = apply(paid, { type: "holdForReview", reason: "fraud check" }, T2);
  assert.equal(held.state, "on_hold");
  assert.equal(held.heldFrom, "paid");
  assert.equal(held.holdReason, "fraud check");
  assert.deepEqual(held.history, [
    { type: "pay", at: T0 },
    { type: "holdForReview", at: T2 },
  ]);
  assert.equal(paid.state, "paid");
  assert.equal(paid.heldFrom, null);
  assert.equal(paid.holdReason, null);
  assert.equal(paid.history.length, 1);
});

test("holding a packed order records where it was held from", () => {
  const held = apply(packedOrder("h-2"), { type: "holdForReview", reason: "address" }, T2);
  assert.equal(held.state, "on_hold");
  assert.equal(held.heldFrom, "packed");
  assert.equal(held.holdReason, "address");
});

test("holdForReview is rejected outside paid and packed", () => {
  const created = createOrder("h-3", 100);
  const shipped = apply(packedOrder("h-3b"), { type: "ship", carrier: "DHL", tracking: "X1" }, T2);
  const delivered = apply(shipped, { type: "deliver" }, T3);
  const cancelled = apply(created, { type: "cancel", reason: "changed mind" }, T1);
  const returned = apply(delivered, { type: "requestReturn", reason: "broken" }, T3);
  for (const order of [created, shipped, delivered, cancelled, returned]) {
    assert.throws(
      () => apply(order, { type: "holdForReview", reason: "x" }, T3),
      isInvalidTransition,
      `state ${order.state}`,
    );
  }
});

test("approving a review returns the order to the state it was held from", () => {
  const cases = [
    [paidOrder("h-4"), "paid"],
    [packedOrder("h-5"), "packed"],
  ] as const;
  for (const [order, from] of cases) {
    const held = apply(order, { type: "holdForReview", reason: "check" }, T2);
    const approved = apply(held, { type: "review", approved: true }, T3);
    assert.equal(approved.state, from);
    assert.equal(approved.heldFrom, null);
    assert.equal(approved.holdReason, null);
    assert.equal(approved.refundDue, false);
    assert.equal(approved.cancelReason, null);
    assert.deepEqual(approved.history.slice(-2), [
      { type: "holdForReview", at: T2 },
      { type: "review", at: T3 },
    ]);
    assert.equal(held.state, "on_hold");
    assert.equal(held.heldFrom, from);
    assert.equal(held.holdReason, "check");
  }
});

test("an approved packed order can then be shipped", () => {
  let order = apply(packedOrder("h-6"), { type: "holdForReview", reason: "check" }, T2);
  order = apply(order, { type: "review", approved: true }, T3);
  order = apply(order, { type: "ship", carrier: "UPS", tracking: "1Z" }, T3);
  assert.equal(order.state, "shipped");
});

test("rejecting a review cancels the order with a refund due", () => {
  const held = apply(packedOrder("h-7"), { type: "holdForReview", reason: "suspected fraud" }, T2);
  const rejected = apply(held, { type: "review", approved: false }, T3);
  assert.equal(rejected.state, "cancelled");
  assert.equal(rejected.refundDue, true);
  assert.equal(rejected.cancelReason, "suspected fraud");
  assert.equal(rejected.heldFrom, null);
  assert.equal(rejected.holdReason, null);
  assert.equal(held.state, "on_hold");

  const refunded = apply(rejected, { type: "refund" }, T3);
  assert.equal(refunded.refundDue, false);
  assert.equal(refunded.refundedAt, T3);
});

test("review is rejected unless the order is on hold", () => {
  for (const order of [createOrder("h-8", 100), paidOrder("h-9"), packedOrder("h-10")]) {
    for (const approved of [true, false]) {
      assert.throws(() => apply(order, { type: "review", approved }, T3), isInvalidTransition);
    }
  }
});

test("every other event is rejected while on hold and changes nothing", () => {
  for (const base of [paidOrder("h-11"), packedOrder("h-12")]) {
    const held = apply(base, { type: "holdForReview", reason: "check" }, T2);
    const snapshot = structuredClone(held);
    const events = [
      { type: "pay", amount: 100 },
      { type: "pack" },
      { type: "ship", carrier: "DHL", tracking: "X1" },
      { type: "deliver" },
      { type: "cancel", reason: "nope" },
      { type: "requestReturn", reason: "nope" },
      { type: "refund" },
      { type: "holdForReview", reason: "again" },
    ] as const;
    for (const event of events) {
      assert.throws(() => apply(held, event, T3), isInvalidTransition, event.type);
    }
    assert.deepEqual(held, snapshot);
  }
});
