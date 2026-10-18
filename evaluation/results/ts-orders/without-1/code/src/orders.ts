export type OrderState =
  | "created"
  | "paid"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned";

export type OrderEvent =
  | { type: "pay"; amount: number }
  | { type: "pack" }
  | { type: "ship"; carrier: string; tracking: string }
  | { type: "deliver" }
  | { type: "cancel"; reason: string }
  | { type: "requestReturn"; reason: string }
  | { type: "refund" };

export interface HistoryEntry {
  type: OrderEvent["type"];
  at: string;
}

export interface Order {
  id: string;
  state: OrderState;
  total: number;
  history: HistoryEntry[];
  paidAt: string | null;
  carrier: string | null;
  tracking: string | null;
  deliveredAt: string | null;
  cancelReason: string | null;
  returnReason: string | null;
  refundDue: boolean;
  refundedAt: string | null;
}

export class OrderError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OrderError";
    this.code = code;
  }
}

export function createOrder(id: string, total: number): Order {
  return {
    id,
    state: "created",
    total,
    history: [],
    paidAt: null,
    carrier: null,
    tracking: null,
    deliveredAt: null,
    cancelReason: null,
    returnReason: null,
    refundDue: false,
    refundedAt: null,
  };
}

const RETURN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function invalid(order: Order, event: OrderEvent): OrderError {
  return new OrderError(
    "invalid_transition",
    `cannot apply ${event.type} in state ${order.state}`,
  );
}

export function apply(order: Order, event: OrderEvent, now: string): Order {
  const next: Order = {
    ...order,
    history: [...order.history, { type: event.type, at: now }],
  };

  switch (event.type) {
    case "pay":
      if (order.state !== "created") throw invalid(order, event);
      if (event.amount !== order.total) {
        throw new OrderError("amount_mismatch", "amount does not match total");
      }
      next.state = "paid";
      next.paidAt = now;
      return next;
    case "pack":
      if (order.state !== "paid") throw invalid(order, event);
      next.state = "packed";
      return next;
    case "ship":
      if (order.state !== "packed") throw invalid(order, event);
      if (typeof event.carrier !== "string" || event.carrier.trim() === "") {
        throw new OrderError("missing_carrier", "carrier is required");
      }
      if (typeof event.tracking !== "string" || event.tracking.trim() === "") {
        throw new OrderError("missing_tracking", "tracking is required");
      }
      next.state = "shipped";
      next.carrier = event.carrier;
      next.tracking = event.tracking;
      return next;
    case "deliver":
      if (order.state !== "shipped") throw invalid(order, event);
      next.state = "delivered";
      next.deliveredAt = now;
      return next;
    case "cancel":
      if (
        order.state !== "created" &&
        order.state !== "paid" &&
        order.state !== "packed"
      ) {
        throw invalid(order, event);
      }
      next.state = "cancelled";
      next.cancelReason = event.reason;
      if (order.paidAt !== null) next.refundDue = true;
      return next;
    case "requestReturn":
      if (order.state !== "delivered") throw invalid(order, event);
      if (
        order.deliveredAt === null ||
        Date.parse(now) - Date.parse(order.deliveredAt) > RETURN_WINDOW_MS
      ) {
        throw new OrderError("return_window_closed", "return window closed");
      }
      next.state = "returned";
      next.returnReason = event.reason;
      next.refundDue = true;
      return next;
    case "refund":
      if (order.refundedAt !== null) {
        throw new OrderError("already_refunded", "order already refunded");
      }
      if (
        (order.state !== "cancelled" && order.state !== "returned") ||
        !order.refundDue
      ) {
        throw invalid(order, event);
      }
      next.refundedAt = now;
      next.refundDue = false;
      return next;
    default:
      throw invalid(order, event);
  }
}
