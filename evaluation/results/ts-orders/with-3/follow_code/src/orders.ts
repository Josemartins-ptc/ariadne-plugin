export type OrderState =
  | "created"
  | "paid"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned"
  | "on_hold";

export type OrderEvent =
  | { type: "pay"; amount: number }
  | { type: "pack" }
  | { type: "ship"; carrier: string; tracking: string }
  | { type: "deliver" }
  | { type: "cancel"; reason: string }
  | { type: "requestReturn"; reason: string }
  | { type: "refund" }
  | { type: "holdForReview"; reason: string }
  | { type: "review"; approved: boolean };

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
  heldFrom: "paid" | "packed" | null;
  holdReason: string | null;
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
    heldFrom: null,
    holdReason: null,
  };
}

const RETURN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const ALLOWED_FROM: Record<Exclude<OrderEvent["type"], "refund">, OrderState[]> = {
  pay: ["created"],
  pack: ["paid"],
  ship: ["packed"],
  deliver: ["shipped"],
  cancel: ["created", "paid", "packed"],
  requestReturn: ["delivered"],
  holdForReview: ["paid", "packed"],
  review: ["on_hold"],
};

function invalidTransition(order: Order, event: OrderEvent): OrderError {
  return new OrderError(
    "invalid_transition",
    `cannot apply ${event.type} in state ${order.state}`,
  );
}

function payChanges(order: Order, amount: number, now: string): Partial<Order> {
  if (amount !== order.total) {
    throw new OrderError("amount_mismatch", "amount does not match total");
  }
  return { state: "paid", paidAt: now };
}

function shipChanges(carrier: string, tracking: string): Partial<Order> {
  if (carrier.trim() === "") {
    throw new OrderError("missing_carrier", "carrier is required");
  }
  if (tracking.trim() === "") {
    throw new OrderError("missing_tracking", "tracking is required");
  }
  return { state: "shipped", carrier, tracking };
}

function returnChanges(order: Order, reason: string, now: string): Partial<Order> {
  const elapsed = Date.parse(now) - Date.parse(order.deliveredAt as string);
  if (elapsed > RETURN_WINDOW_MS) {
    throw new OrderError("return_window_closed", "return window has closed");
  }
  return { state: "returned", returnReason: reason, refundDue: true };
}

function changes(order: Order, event: OrderEvent, now: string): Partial<Order> {
  switch (event.type) {
    case "pay":
      return payChanges(order, event.amount, now);
    case "pack":
      return { state: "packed" };
    case "ship":
      return shipChanges(event.carrier, event.tracking);
    case "deliver":
      return { state: "delivered", deliveredAt: now };
    case "cancel":
      return {
        state: "cancelled",
        cancelReason: event.reason,
        refundDue: order.paidAt !== null,
      };
    case "requestReturn":
      return returnChanges(order, event.reason, now);
    case "holdForReview":
      return {
        state: "on_hold",
        heldFrom: order.state as "paid" | "packed",
        holdReason: event.reason,
      };
    case "review":
      return event.approved
        ? { state: order.heldFrom as "paid" | "packed", heldFrom: null, holdReason: null }
        : {
            state: "cancelled",
            refundDue: true,
            cancelReason: order.holdReason,
            heldFrom: null,
            holdReason: null,
          };
    case "refund":
      return { refundedAt: now, refundDue: false };
  }
}

export function apply(order: Order, event: OrderEvent, now: string): Order {
  if (event.type === "refund") {
    if (order.refundedAt !== null) {
      throw new OrderError("already_refunded", "order already refunded");
    }
    if (
      !(order.state === "cancelled" || order.state === "returned") ||
      !order.refundDue
    ) {
      throw invalidTransition(order, event);
    }
  } else if (!ALLOWED_FROM[event.type].includes(order.state)) {
    throw invalidTransition(order, event);
  }
  return {
    ...order,
    ...changes(order, event, now),
    history: [...order.history, { type: event.type, at: now }],
  };
}
