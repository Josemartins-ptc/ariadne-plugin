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

const RETURN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const ALLOWED_FROM: Record<Exclude<OrderEvent["type"], "refund">, OrderState[]> = {
  pay: ["created"],
  pack: ["paid"],
  ship: ["packed"],
  deliver: ["shipped"],
  cancel: ["created", "paid", "packed"],
  requestReturn: ["delivered"],
};

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

function invalidTransition(order: Order, event: OrderEvent): OrderError {
  return new OrderError(
    "invalid_transition",
    `cannot ${event.type} an order in state ${order.state}`,
  );
}

function isBlank(value: string): boolean {
  return value.trim() === "";
}

export function apply(order: Order, event: OrderEvent, now: string): Order {
  if (event.type === "refund") {
    if (order.refundedAt !== null) {
      throw new OrderError("already_refunded", `order ${order.id} has already been refunded`);
    }
    if (!((order.state === "cancelled" || order.state === "returned") && order.refundDue)) {
      throw invalidTransition(order, event);
    }
  } else if (!ALLOWED_FROM[event.type].includes(order.state)) {
    throw invalidTransition(order, event);
  }

  const next: Order = {
    ...order,
    history: [...order.history, { type: event.type, at: now }],
  };

  switch (event.type) {
    case "pay":
      if (event.amount !== order.total) {
        throw new OrderError(
          "amount_mismatch",
          `payment of ${event.amount} does not match order total ${order.total}`,
        );
      }
      next.state = "paid";
      next.paidAt = now;
      break;
    case "pack":
      next.state = "packed";
      break;
    case "ship":
      if (isBlank(event.carrier)) {
        throw new OrderError("missing_carrier", "carrier is required");
      }
      if (isBlank(event.tracking)) {
        throw new OrderError("missing_tracking", "tracking number is required");
      }
      next.state = "shipped";
      next.carrier = event.carrier;
      next.tracking = event.tracking;
      break;
    case "deliver":
      next.state = "delivered";
      next.deliveredAt = now;
      break;
    case "cancel":
      next.state = "cancelled";
      next.cancelReason = event.reason;
      next.refundDue = order.paidAt !== null;
      break;
    case "requestReturn":
      if (Date.parse(now) - Date.parse(order.deliveredAt as string) > RETURN_WINDOW_MS) {
        throw new OrderError("return_window_closed", "the 30-day return window has closed");
      }
      next.state = "returned";
      next.returnReason = event.reason;
      next.refundDue = true;
      break;
    case "refund":
      next.refundedAt = now;
      next.refundDue = false;
      break;
  }

  return next;
}
