import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, createOrder, OrderError, type Order, type OrderEvent } from "./orders.ts";

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

function paidOrder(id: string): Order {
  return apply(createOrder(id, 100), { type: "pay", amount: 100 }, "2026-03-01T10:00:00.000Z");
}

function isInvalidTransition(err: unknown): boolean {
  return err instanceof OrderError && err.code === "invalid_transition";
}

test("a new order has no hold information", () => {
  const order = createOrder("h-0", 100);
  assert.equal(order.heldFrom, null);
  assert.equal(order.holdReason, null);
});

test("holding a paid order moves it to on_hold and records where it came from", () => {
  const paid = paidOrder("h-1");
  const held = apply(paid, { type: "holdForReview", reason: "fraud check" }, "2026-03-01T11:00:00.000Z");
  assert.equal(held.state, "on_hold");
  assert.equal(held.heldFrom, "paid");
  assert.equal(held.holdReason, "fraud check");
  assert.deepEqual(held.history.at(-1), { type: "holdForReview", at: "2026-03-01T11:00:00.000Z" });
  assert.equal(paid.state, "paid");
  assert.equal(paid.heldFrom, null);
  assert.equal(paid.holdReason, null);
  assert.equal(paid.history.length, 1);
});

test("holding a packed order records packed as heldFrom", () => {
  const packed = apply(paidOrder("h-2"), { type: "pack" }, "2026-03-01T11:00:00.000Z");
  const held = apply(packed, { type: "holdForReview", reason: "address" }, "2026-03-01T12:00:00.000Z");
  assert.equal(held.state, "on_hold");
  assert.equal(held.heldFrom, "packed");
});

test("holdForReview is rejected outside paid and packed", () => {
  const created = createOrder("h-3", 100);
  const hold: OrderEvent = { type: "holdForReview", reason: "x" };
  assert.throws(() => apply(created, hold, "2026-03-01T10:00:00.000Z"), isInvalidTransition);
  let shipped = apply(paidOrder("h-3b"), { type: "pack" }, "2026-03-01T11:00:00.000Z");
  shipped = apply(shipped, { type: "ship", carrier: "DHL", tracking: "T1" }, "2026-03-01T12:00:00.000Z");
  assert.throws(() => apply(shipped, hold, "2026-03-01T13:00:00.000Z"), isInvalidTransition);
  const cancelled = apply(created, { type: "cancel", reason: "changed mind" }, "2026-03-01T10:00:00.000Z");
  assert.throws(() => apply(cancelled, hold, "2026-03-01T11:00:00.000Z"), isInvalidTransition);
});

test("approving a review returns the order to the state it was held from", () => {
  const held = apply(paidOrder("h-4"), { type: "holdForReview", reason: "check" }, "2026-03-01T11:00:00.000Z");
  const approved = apply(held, { type: "review", approved: true }, "2026-03-01T12:00:00.000Z");
  assert.equal(approved.state, "paid");
  assert.equal(approved.heldFrom, null);
  assert.equal(approved.holdReason, null);
  assert.equal(approved.cancelReason, null);
  assert.equal(approved.refundDue, false);
  assert.deepEqual(approved.history.map((h) => h.type), ["pay", "holdForReview", "review"]);
  assert.equal(held.state, "on_hold");

  const packed = apply(approved, { type: "pack" }, "2026-03-01T13:00:00.000Z");
  const heldPacked = apply(packed, { type: "holdForReview", reason: "again" }, "2026-03-01T14:00:00.000Z");
  const back = apply(heldPacked, { type: "review", approved: true }, "2026-03-01T15:00:00.000Z");
  assert.equal(back.state, "packed");
  const shipped = apply(back, { type: "ship", carrier: "DHL", tracking: "T2" }, "2026-03-01T16:00:00.000Z");
  assert.equal(shipped.state, "shipped");
});

test("rejecting a review cancels the order with a refund due and the hold reason", () => {
  const held = apply(paidOrder("h-5"), { type: "holdForReview", reason: "suspected fraud" }, "2026-03-01T11:00:00.000Z");
  const rejected = apply(held, { type: "review", approved: false }, "2026-03-01T12:00:00.000Z");
  assert.equal(rejected.state, "cancelled");
  assert.equal(rejected.refundDue, true);
  assert.equal(rejected.cancelReason, "suspected fraud");
  assert.equal(rejected.heldFrom, null);
  assert.equal(rejected.holdReason, null);
  assert.deepEqual(rejected.history.at(-1), { type: "review", at: "2026-03-01T12:00:00.000Z" });
  const refunded = apply(rejected, { type: "refund" }, "2026-03-01T13:00:00.000Z");
  assert.equal(refunded.refundedAt, "2026-03-01T13:00:00.000Z");
  assert.equal(refunded.refundDue, false);
});

test("review is rejected unless the order is on hold", () => {
  const review: OrderEvent = { type: "review", approved: true };
  assert.throws(() => apply(paidOrder("h-6"), review, "2026-03-01T11:00:00.000Z"), isInvalidTransition);
  assert.throws(() => apply(createOrder("h-6b", 1), review, "2026-03-01T11:00:00.000Z"), isInvalidTransition);
});

test("every other event is rejected while an order is on hold, and nothing changes", () => {
  const packed = apply(paidOrder("h-7"), { type: "pack" }, "2026-03-01T11:00:00.000Z");
  const held = apply(packed, { type: "holdForReview", reason: "check" }, "2026-03-01T12:00:00.000Z");
  const snapshot = structuredClone(held);
  const events: OrderEvent[] = [
    { type: "pay", amount: 100 },
    { type: "pack" },
    { type: "ship", carrier: "DHL", tracking: "T3" },
    { type: "deliver" },
    { type: "cancel", reason: "nope" },
    { type: "requestReturn", reason: "nope" },
    { type: "refund" },
    { type: "holdForReview", reason: "again" },
  ];
  for (const event of events) {
    assert.throws(() => apply(held, event, "2026-03-01T13:00:00.000Z"), isInvalidTransition, event.type);
  }
  assert.deepEqual(held, snapshot);
});
