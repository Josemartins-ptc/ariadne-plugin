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

function isInvalidTransition(err: unknown): boolean {
  return err instanceof OrderError && err.code === "invalid_transition";
}

function paidOrder(id: string) {
  return apply(createOrder(id, 100), { type: "pay", amount: 100 }, "2026-03-01T10:00:00.000Z");
}

function packedOrder(id: string) {
  return apply(paidOrder(id), { type: "pack" }, "2026-03-01T11:00:00.000Z");
}

test("createOrder starts with no hold", () => {
  const order = createOrder("h-0", 100);
  assert.equal(order.heldFrom, null);
  assert.equal(order.holdReason, null);
});

test("a paid order can be held for review", () => {
  const paid = paidOrder("h-1");
  const held = apply(paid, { type: "holdForReview", reason: "fraud check" }, "2026-03-01T12:00:00.000Z");
  assert.equal(held.state, "on_hold");
  assert.equal(held.heldFrom, "paid");
  assert.equal(held.holdReason, "fraud check");
  assert.deepEqual(held.history.at(-1), { type: "holdForReview", at: "2026-03-01T12:00:00.000Z" });
  assert.equal(paid.state, "paid");
  assert.equal(paid.heldFrom, null);
  assert.equal(paid.history.length, 1);
});

test("a packed order can be held for review", () => {
  const held = apply(packedOrder("h-2"), { type: "holdForReview", reason: "address" }, "2026-03-01T12:00:00.000Z");
  assert.equal(held.state, "on_hold");
  assert.equal(held.heldFrom, "packed");
  assert.equal(held.holdReason, "address");
});

test("holdForReview is rejected outside paid and packed", () => {
  const created = createOrder("h-3", 100);
  const shipped = apply(packedOrder("h-3b"), { type: "ship", carrier: "DHL", tracking: "T1" }, "2026-03-02T09:00:00.000Z");
  const delivered = apply(shipped, { type: "deliver" }, "2026-03-03T09:00:00.000Z");
  const cancelled = apply(created, { type: "cancel", reason: "nope" }, "2026-03-01T10:00:00.000Z");
  for (const order of [created, shipped, delivered, cancelled]) {
    const before = structuredClone(order);
    assert.throws(
      () => apply(order, { type: "holdForReview", reason: "x" }, "2026-03-04T00:00:00.000Z"),
      isInvalidTransition,
    );
    assert.deepEqual(order, before);
  }
});

test("approving a review returns the order to the state it was held from", () => {
  const fromPaid = apply(
    apply(paidOrder("h-4"), { type: "holdForReview", reason: "r" }, "2026-03-01T12:00:00.000Z"),
    { type: "review", approved: true },
    "2026-03-01T13:00:00.000Z",
  );
  assert.equal(fromPaid.state, "paid");
  assert.equal(fromPaid.heldFrom, null);
  assert.equal(fromPaid.holdReason, null);
  assert.equal(fromPaid.cancelReason, null);
  assert.equal(fromPaid.refundDue, false);
  assert.deepEqual(fromPaid.history.map((h) => h.type), ["pay", "holdForReview", "review"]);

  const fromPacked = apply(
    apply(packedOrder("h-5"), { type: "holdForReview", reason: "r" }, "2026-03-01T12:00:00.000Z"),
    { type: "review", approved: true },
    "2026-03-01T13:00:00.000Z",
  );
  assert.equal(fromPacked.state, "packed");
  const shipped = apply(fromPacked, { type: "ship", carrier: "UPS", tracking: "1Z" }, "2026-03-02T09:00:00.000Z");
  assert.equal(shipped.state, "shipped");
});

test("rejecting a review cancels the order with a refund due", () => {
  const held = apply(packedOrder("h-6"), { type: "holdForReview", reason: "suspected fraud" }, "2026-03-01T12:00:00.000Z");
  const rejected = apply(held, { type: "review", approved: false }, "2026-03-01T13:00:00.000Z");
  assert.equal(rejected.state, "cancelled");
  assert.equal(rejected.refundDue, true);
  assert.equal(rejected.cancelReason, "suspected fraud");
  assert.equal(rejected.heldFrom, null);
  assert.equal(rejected.holdReason, null);
  assert.deepEqual(rejected.history.at(-1), { type: "review", at: "2026-03-01T13:00:00.000Z" });
  assert.equal(held.state, "on_hold");
  assert.equal(held.holdReason, "suspected fraud");

  const refunded = apply(rejected, { type: "refund" }, "2026-03-01T14:00:00.000Z");
  assert.equal(refunded.refundedAt, "2026-03-01T14:00:00.000Z");
  assert.equal(refunded.refundDue, false);
});

test("review is rejected unless the order is on hold", () => {
  for (const order of [createOrder("h-7", 100), paidOrder("h-7b"), packedOrder("h-7c")]) {
    assert.throws(
      () => apply(order, { type: "review", approved: true }, "2026-03-02T00:00:00.000Z"),
      isInvalidTransition,
    );
  }
});

test("an order on hold rejects every other event", () => {
  const held = apply(packedOrder("h-8"), { type: "holdForReview", reason: "r" }, "2026-03-01T12:00:00.000Z");
  const before = structuredClone(held);
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
  assert.deepEqual(held, before);
});
