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
  return apply(createOrder("h", 100), { type: "pay", amount: 100 }, T);
}
function packedOrder() {
  return apply(paidOrder(), { type: "pack" }, T);
}
function code(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e instanceof OrderError ? e.code : "other";
  }
  return "none";
}

test("createOrder starts with no hold info", () => {
  const o = createOrder("x", 1);
  assert.equal(o.heldFrom, null);
  assert.equal(o.holdReason, null);
});

test("holdForReview from paid and packed records origin and reason", () => {
  for (const [o, from] of [[paidOrder(), "paid"], [packedOrder(), "packed"]] as const) {
    const held = apply(o, { type: "holdForReview", reason: "fraud?" }, "2026-03-02T00:00:00.000Z");
    assert.equal(held.state, "on_hold");
    assert.equal(held.heldFrom, from);
    assert.equal(held.holdReason, "fraud?");
    assert.deepEqual(held.history.at(-1), { type: "holdForReview", at: "2026-03-02T00:00:00.000Z" });
    assert.equal(o.state, from);
    assert.equal(o.heldFrom, null);
  }
});

test("holdForReview is invalid from other states", () => {
  const created = createOrder("c", 100);
  const shipped = apply(packedOrder(), { type: "ship", carrier: "UPS", tracking: "1" }, T);
  const delivered = apply(shipped, { type: "deliver" }, T);
  const cancelled = apply(created, { type: "cancel", reason: "x" }, T);
  for (const o of [created, shipped, delivered, cancelled]) {
    assert.equal(code(() => apply(o, { type: "holdForReview", reason: "r" }, T)), "invalid_transition");
  }
});

test("approved review returns to the held-from state and clears hold info", () => {
  for (const o of [paidOrder(), packedOrder()]) {
    const held = apply(o, { type: "holdForReview", reason: "r" }, T);
    const back = apply(held, { type: "review", approved: true }, T);
    assert.equal(back.state, o.state);
    assert.equal(back.heldFrom, null);
    assert.equal(back.holdReason, null);
    assert.deepEqual(back.history.map((h) => h.type).slice(-2), ["holdForReview", "review"]);
    assert.equal(held.state, "on_hold");
  }
});

test("a packed order approved from hold can still ship", () => {
  const held = apply(packedOrder(), { type: "holdForReview", reason: "r" }, T);
  const back = apply(held, { type: "review", approved: true }, T);
  assert.equal(apply(back, { type: "ship", carrier: "UPS", tracking: "1" }, T).state, "shipped");
});

test("rejected review cancels with refund due and hold reason, then can be refunded", () => {
  const held = apply(paidOrder(), { type: "holdForReview", reason: "suspicious" }, T);
  const rejected = apply(held, { type: "review", approved: false }, T);
  assert.equal(rejected.state, "cancelled");
  assert.equal(rejected.refundDue, true);
  assert.equal(rejected.cancelReason, "suspicious");
  assert.equal(rejected.heldFrom, null);
  assert.equal(rejected.holdReason, null);
  assert.equal(apply(rejected, { type: "refund" }, T).refundDue, false);
});

test("review is invalid unless on hold", () => {
  for (const o of [createOrder("c", 1), paidOrder(), packedOrder()]) {
    assert.equal(code(() => apply(o, { type: "review", approved: true }, T)), "invalid_transition");
  }
});

test("every other event is invalid while on hold, and nothing changes", () => {
  const held = apply(packedOrder(), { type: "holdForReview", reason: "r" }, T);
  const snapshot = structuredClone(held);
  const events = [
    { type: "pay", amount: 100 },
    { type: "pack" },
    { type: "ship", carrier: "UPS", tracking: "1" },
    { type: "deliver" },
    { type: "cancel", reason: "x" },
    { type: "requestReturn", reason: "x" },
    { type: "refund" },
    { type: "holdForReview", reason: "again" },
  ] as const;
  for (const e of events) {
    assert.equal(code(() => apply(held, e, T)), "invalid_transition", e.type);
  }
  assert.deepEqual(held, snapshot);
});
