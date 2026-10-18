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

function paidOrder() {
  return apply(createOrder("h-1", 100), { type: "pay", amount: 100 }, T0);
}

function packedOrder() {
  return apply(paidOrder(), { type: "pack" }, T1);
}

function invalid(fn: () => unknown) {
  assert.throws(fn, (err: unknown) => err instanceof OrderError && err.code === "invalid_transition");
}

test("createOrder starts with no hold info", () => {
  const order = createOrder("h-0", 1);
  assert.equal(order.heldFrom, null);
  assert.equal(order.holdReason, null);
});

test("holdForReview from paid and packed records origin and reason", () => {
  for (const [order, from] of [[paidOrder(), "paid"], [packedOrder(), "packed"]] as const) {
    const before = structuredClone(order);
    const held = apply(order, { type: "holdForReview", reason: "fraud check" }, T2);
    assert.equal(held.state, "on_hold");
    assert.equal(held.heldFrom, from);
    assert.equal(held.holdReason, "fraud check");
    assert.deepEqual(held.history.at(-1), { type: "holdForReview", at: T2 });
    assert.deepEqual(order, before);
  }
});

test("holdForReview is rejected from other states", () => {
  invalid(() => apply(createOrder("x", 1), { type: "holdForReview", reason: "r" }, T0));
  const shipped = apply(packedOrder(), { type: "ship", carrier: "UPS", tracking: "1" }, T2);
  invalid(() => apply(shipped, { type: "holdForReview", reason: "r" }, T2));
  const cancelled = apply(paidOrder(), { type: "cancel", reason: "c" }, T1);
  invalid(() => apply(cancelled, { type: "holdForReview", reason: "r" }, T2));
});

test("approved review returns the order to where it was held", () => {
  for (const order of [paidOrder(), packedOrder()]) {
    const held = apply(order, { type: "holdForReview", reason: "r" }, T2);
    const back = apply(held, { type: "review", approved: true }, "2026-03-01T13:00:00.000Z");
    assert.equal(back.state, order.state);
    assert.equal(back.heldFrom, null);
    assert.equal(back.holdReason, null);
    assert.deepEqual(back.history.map((h) => h.type).slice(-2), ["holdForReview", "review"]);
    assert.equal(held.state, "on_hold");
  }
});

test("a packed order can ship after approved review", () => {
  let order = apply(packedOrder(), { type: "holdForReview", reason: "r" }, T2);
  order = apply(order, { type: "review", approved: true }, T2);
  order = apply(order, { type: "ship", carrier: "UPS", tracking: "1" }, T2);
  assert.equal(order.state, "shipped");
});

test("rejected review cancels with refund due and hold reason", () => {
  const held = apply(paidOrder(), { type: "holdForReview", reason: "suspicious" }, T2);
  const cancelled = apply(held, { type: "review", approved: false }, T2);
  assert.equal(cancelled.state, "cancelled");
  assert.equal(cancelled.refundDue, true);
  assert.equal(cancelled.cancelReason, "suspicious");
  assert.equal(cancelled.heldFrom, null);
  assert.equal(cancelled.holdReason, null);
  const refunded = apply(cancelled, { type: "refund" }, T2);
  assert.equal(refunded.refundDue, false);
});

test("review is rejected unless on hold", () => {
  invalid(() => apply(paidOrder(), { type: "review", approved: true }, T2));
  invalid(() => apply(createOrder("x", 1), { type: "review", approved: false }, T2));
});

test("every other event is rejected while on hold", () => {
  const held = apply(packedOrder(), { type: "holdForReview", reason: "r" }, T2);
  const before = structuredClone(held);
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
  for (const event of events) invalid(() => apply(held, event, T2));
  assert.deepEqual(held, before);
});
