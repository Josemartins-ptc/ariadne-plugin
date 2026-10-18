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

function paidOrder(id: string) {
  return apply(createOrder(id, 100), { type: "pay", amount: 100 }, "2026-03-01T10:00:00.000Z");
}

function packedOrder(id: string) {
  return apply(paidOrder(id), { type: "pack" }, "2026-03-01T11:00:00.000Z");
}

const isInvalidTransition = (err: unknown) =>
  err instanceof OrderError && err.code === "invalid_transition";

test("a new order has no hold fields set", () => {
  const order = createOrder("o-10", 100);
  assert.equal(order.heldFrom, null);
  assert.equal(order.holdReason, null);
});

test("holding a paid order moves it to on_hold and records where it came from", () => {
  const paid = paidOrder("o-11");
  const held = apply(paid, { type: "holdForReview", reason: "fraud check" }, "2026-03-01T12:00:00.000Z");
  assert.equal(held.state, "on_hold");
  assert.equal(held.heldFrom, "paid");
  assert.equal(held.holdReason, "fraud check");
  assert.deepEqual(held.history.at(-1), { type: "holdForReview", at: "2026-03-01T12:00:00.000Z" });
  assert.equal(paid.state, "paid");
  assert.equal(paid.heldFrom, null);
  assert.equal(paid.history.length, 1);
});

test("holding a packed order records packed as heldFrom", () => {
  const held = apply(packedOrder("o-12"), { type: "holdForReview", reason: "address" }, "2026-03-01T12:00:00.000Z");
  assert.equal(held.state, "on_hold");
  assert.equal(held.heldFrom, "packed");
  assert.equal(held.holdReason, "address");
});

test("holdForReview is rejected outside paid and packed", () => {
  const created = createOrder("o-13", 100);
  const shipped = apply(packedOrder("o-13"), { type: "ship", carrier: "DHL", tracking: "T1" }, "2026-03-02T09:00:00.000Z");
  const delivered = apply(shipped, { type: "deliver" }, "2026-03-03T09:00:00.000Z");
  const cancelled = apply(created, { type: "cancel", reason: "x" }, "2026-03-01T10:00:00.000Z");
  const returned = apply(delivered, { type: "requestReturn", reason: "x" }, "2026-03-04T09:00:00.000Z");
  for (const order of [created, shipped, delivered, cancelled, returned]) {
    assert.throws(
      () => apply(order, { type: "holdForReview", reason: "r" }, "2026-03-05T00:00:00.000Z"),
      isInvalidTransition,
    );
  }
});

test("approving a review returns the order to the state it was held from", () => {
  for (const [order, from] of [[paidOrder("o-14"), "paid"], [packedOrder("o-15"), "packed"]] as const) {
    const held = apply(order, { type: "holdForReview", reason: "check" }, "2026-03-01T12:00:00.000Z");
    const approved = apply(held, { type: "review", approved: true }, "2026-03-01T13:00:00.000Z");
    assert.equal(approved.state, from);
    assert.equal(approved.heldFrom, null);
    assert.equal(approved.holdReason, null);
    assert.equal(approved.refundDue, false);
    assert.deepEqual(approved.history.at(-1), { type: "review", at: "2026-03-01T13:00:00.000Z" });
    assert.equal(held.state, "on_hold");
    assert.equal(held.heldFrom, from);
  }
});

test("an approved packed order can then be shipped", () => {
  let order = apply(packedOrder("o-16"), { type: "holdForReview", reason: "check" }, "2026-03-01T12:00:00.000Z");
  order = apply(order, { type: "review", approved: true }, "2026-03-01T13:00:00.000Z");
  order = apply(order, { type: "ship", carrier: "UPS", tracking: "1Z" }, "2026-03-01T14:00:00.000Z");
  assert.equal(order.state, "shipped");
  assert.deepEqual(
    order.history.map((h) => h.type),
    ["pay", "pack", "holdForReview", "review", "ship"],
  );
});

test("rejecting a review cancels the order with a refund due and the hold reason", () => {
  const held = apply(packedOrder("o-17"), { type: "holdForReview", reason: "suspected fraud" }, "2026-03-01T12:00:00.000Z");
  const rejected = apply(held, { type: "review", approved: false }, "2026-03-01T13:00:00.000Z");
  assert.equal(rejected.state, "cancelled");
  assert.equal(rejected.refundDue, true);
  assert.equal(rejected.cancelReason, "suspected fraud");
  assert.equal(rejected.heldFrom, null);
  assert.equal(rejected.holdReason, null);
  const refunded = apply(rejected, { type: "refund" }, "2026-03-02T00:00:00.000Z");
  assert.equal(refunded.refundedAt, "2026-03-02T00:00:00.000Z");
  assert.equal(refunded.refundDue, false);
});

test("review is rejected unless the order is on hold", () => {
  for (const order of [createOrder("o-18", 100), paidOrder("o-18"), packedOrder("o-18")]) {
    for (const approved of [true, false]) {
      assert.throws(() => apply(order, { type: "review", approved }, "2026-03-05T00:00:00.000Z"), isInvalidTransition);
    }
  }
});

test("every other event is rejected while on hold and changes nothing", () => {
  for (const base of [paidOrder("o-19"), packedOrder("o-20")]) {
    const held = apply(base, { type: "holdForReview", reason: "check" }, "2026-03-01T12:00:00.000Z");
    const snapshot = structuredClone(held);
    const events = [
      { type: "pay", amount: 100 },
      { type: "pack" },
      { type: "ship", carrier: "DHL", tracking: "T1" },
      { type: "deliver" },
      { type: "cancel", reason: "x" },
      { type: "requestReturn", reason: "x" },
      { type: "refund" },
      { type: "holdForReview", reason: "again" },
    ] as const;
    for (const event of events) {
      assert.throws(() => apply(held, event, "2026-03-01T13:00:00.000Z"), isInvalidTransition, event.type);
    }
    assert.deepEqual(held, snapshot);
  }
});
