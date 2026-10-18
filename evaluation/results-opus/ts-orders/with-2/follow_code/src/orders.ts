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

function fail(code: string, message: string): never {
  throw new OrderError(code, message);
}

function isBlank(value: string): boolean {
  return value.trim() === "";
}

function checkAllowed(order: Order, event: OrderEvent): void {
  if (order.state === "on_hold" && event.type !== "review") {
    fail("invalid_transition", `cannot ${event.type} order ${order.id} while it is on hold`);
  }
  if (event.type === "refund") {
    if (order.refundedAt !== null) {
      fail("already_refunded", `order ${order.id} has already been refunded`);
    }
    const refundable = order.state === "cancelled" || order.state === "returned";
    if (!refundable || !order.refundDue) {
      fail("invalid_transition", `cannot refund order ${order.id} in state ${order.state}`);
    }
    return;
  }
  if (!ALLOWED_FROM[event.type].includes(order.state)) {
    fail("invalid_transition", `cannot ${event.type} order ${order.id} in state ${order.state}`);
  }
}

type EventOf<T extends OrderEvent["type"]> = Extract<OrderEvent, { type: T }>;
type Handlers = {
  [T in OrderEvent["type"]]: (order: Order, event: EventOf<T>, now: string) => Partial<Order>;
};

const HANDLERS: Handlers = {
  pay(order, event, now) {
    if (event.amount !== order.total) {
      fail("amount_mismatch", `expected ${order.total}, got ${event.amount}`);
    }
    return { state: "paid", paidAt: now };
  },
  pack() {
    return { state: "packed" };
  },
  ship(_order, event) {
    if (isBlank(event.carrier)) fail("missing_carrier", "carrier is required");
    if (isBlank(event.tracking)) fail("missing_tracking", "tracking is required");
    return { state: "shipped", carrier: event.carrier, tracking: event.tracking };
  },
  deliver(_order, _event, now) {
    return { state: "delivered", deliveredAt: now };
  },
  cancel(order, event) {
    return { state: "cancelled", cancelReason: event.reason, refundDue: order.paidAt !== null };
  },
  requestReturn(order, event, now) {
    if (Date.parse(now) - Date.parse(order.deliveredAt as string) > RETURN_WINDOW_MS) {
      fail("return_window_closed", "the 30-day return window has closed");
    }
    return { state: "returned", returnReason: event.reason, refundDue: true };
  },
  refund(_order, _event, now) {
    return { refundedAt: now, refundDue: false };
  },
  holdForReview(order, event) {
    return { state: "on_hold", heldFrom: order.state as "paid" | "packed", holdReason: event.reason };
  },
  review(order, event) {
    if (event.approved) {
      return { state: order.heldFrom as "paid" | "packed", heldFrom: null, holdReason: null };
    }
    return {
      state: "cancelled",
      cancelReason: order.holdReason,
      refundDue: true,
      heldFrom: null,
      holdReason: null,
    };
  },
};

export function apply(order: Order, event: OrderEvent, now: string): Order {
  checkAllowed(order, event);
  const handler = HANDLERS[event.type] as (o: Order, e: OrderEvent, n: string) => Partial<Order>;
  const changes = handler(order, event, now);
  return {
    ...order,
    ...changes,
    history: [...order.history, { type: event.type, at: now }],
  };
}
