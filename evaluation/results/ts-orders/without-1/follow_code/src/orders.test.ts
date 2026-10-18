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

const T = "2026-03-01T10:00:00.000Z";
function paidOrder() {
  return apply(createOrder("h-1", 100), { type: "pay", amount: 100 }, T);
}
function packedOrder() {
  return apply(paidOrder(), { type: "pack" }, T);
}
const isInvalid = (err: unknown) => err instanceof OrderError && err.code === "invalid_transition";

test("createOrder initialises hold fields to null", () => {
  const o = createOrder("h-0", 1);
  assert.equal(o.heldFrom, null);
  assert.equal(o.holdReason, null);
});

test("holdForReview works from paid and packed", () => {
  for (const [order, from] of [[paidOrder(), "paid"], [packedOrder(), "packed"]] as const) {
    const held = apply(order, { type: "holdForReview", reason: "fraud?" }, "2026-03-02T00:00:00.000Z");
    assert.equal(held.state, "on_hold");
    assert.equal(held.heldFrom, from);
    assert.equal(held.holdReason, "fraud?");
    assert.deepEqual(held.history.at(-1), { type: "holdForReview", at: "2026-03-02T00:00:00.000Z" });
    assert.equal(held.history.length, order.history.length + 1);
    assert.equal(order.state, from);
    assert.equal(order.heldFrom, null);
  }
});

test("holdForReview is rejected from other states", () => {
  assert.throws(() => apply(createOrder("x", 1), { type: "holdForReview", reason: "r" }, T), isInvalid);
  let o = apply(packedOrder(), { type: "ship", carrier: "UPS", tracking: "1" }, T);
  assert.throws(() => apply(o, { type: "holdForReview", reason: "r" }, T), isInvalid);
  o = apply(o, { type: "deliver" }, T);
  assert.throws(() => apply(o, { type: "holdForReview", reason: "r" }, T), isInvalid);
  const c = apply(paidOrder(), { type: "cancel", reason: "c" }, T);
  assert.throws(() => apply(c, { type: "holdForReview", reason: "r" }, T), isInvalid);
});

test("approved review returns to the held-from state and clears fields", () => {
  for (const base of [paidOrder(), packedOrder()]) {
    const held = apply(base, { type: "holdForReview", reason: "r" }, T);
    const back = apply(held, { type: "review", approved: true }, "2026-03-03T00:00:00.000Z");
    assert.equal(back.state, base.state);
    assert.equal(back.heldFrom, null);
    assert.equal(back.holdReason, null);
    assert.equal(back.history.at(-1)?.type, "review");
    assert.equal(held.state, "on_hold");
    assert.equal(held.heldFrom, base.state);
  }
});

test("a packed order approved after hold can be shipped", () => {
  const held = apply(packedOrder(), { type: "holdForReview", reason: "r" }, T);
  const back = apply(held, { type: "review", approved: true }, T);
  assert.equal(apply(back, { type: "ship", carrier: "UPS", tracking: "1" }, T).state, "shipped");
});

test("rejected review cancels with refund due and hold reason", () => {
  const held = apply(paidOrder(), { type: "holdForReview", reason: "suspicious" }, T);
  const out = apply(held, { type: "review", approved: false }, T);
  assert.equal(out.state, "cancelled");
  assert.equal(out.refundDue, true);
  assert.equal(out.cancelReason, "suspicious");
  assert.equal(out.heldFrom, null);
  assert.equal(out.holdReason, null);
  assert.equal(apply(out, { type: "refund" }, T).refundedAt, T);
});

test("review is rejected outside on_hold", () => {
  assert.throws(() => apply(paidOrder(), { type: "review", approved: true }, T), isInvalid);
  assert.throws(() => apply(createOrder("x", 1), { type: "review", approved: false }, T), isInvalid);
});

test("every other event is rejected while on hold, without changes", () => {
  const held = apply(packedOrder(), { type: "holdForReview", reason: "r" }, T);
  const snapshot = structuredClone(held);
  const events = [
    { type: "pay", amount: 100 },
    { type: "pack" },
    { type: "ship", carrier: "UPS", tracking: "1" },
    { type: "deliver" },
    { type: "cancel", reason: "c" },
    { type: "requestReturn", reason: "r" },
    { type: "refund" },
    { type: "holdForReview", reason: "again" },
  ] as const;
  for (const e of events) {
    assert.throws(() => apply(held, e, T), isInvalid, e.type);
  }
  assert.deepEqual(held, snapshot);
});
