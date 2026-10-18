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

type EventOf<T extends OrderEvent["type"]> = Extract<OrderEvent, { type: T }>;

type Changes = Partial<Omit<Order, "id" | "total" | "history">>;

type Handlers = {
  [T in OrderEvent["type"]]: (order: Order, event: EventOf<T>, now: string) => Changes;
};

function fail(code: string, message: string): never {
  throw new OrderError(code, message);
}

function requireState(order: Order, event: OrderEvent, allowed: OrderState[]): void {
  if (!allowed.includes(order.state)) {
    fail("invalid_transition", `cannot ${event.type} an order in state ${order.state}`);
  }
}

function isBlank(value: string): boolean {
  return value.trim() === "";
}

const handlers: Handlers = {
  pay(order, event, now) {
    requireState(order, event, ["created"]);
    if (event.amount !== order.total) {
      fail("amount_mismatch", `paid ${event.amount} but total is ${order.total}`);
    }
    return { state: "paid", paidAt: now };
  },

  pack(order, event) {
    requireState(order, event, ["paid"]);
    return { state: "packed" };
  },

  ship(order, event) {
    requireState(order, event, ["packed"]);
    if (isBlank(event.carrier)) fail("missing_carrier", "carrier is required");
    if (isBlank(event.tracking)) fail("missing_tracking", "tracking is required");
    return { state: "shipped", carrier: event.carrier, tracking: event.tracking };
  },

  deliver(order, event, now) {
    requireState(order, event, ["shipped"]);
    return { state: "delivered", deliveredAt: now };
  },

  cancel(order, event) {
    requireState(order, event, ["created", "paid", "packed"]);
    return { state: "cancelled", cancelReason: event.reason, refundDue: order.paidAt !== null };
  },

  requestReturn(order, event, now) {
    requireState(order, event, ["delivered"]);
    const elapsed = Date.parse(now) - Date.parse(order.deliveredAt as string);
    if (!(elapsed <= RETURN_WINDOW_MS)) {
      fail("return_window_closed", "the 30-day return window has closed");
    }
    return { state: "returned", returnReason: event.reason, refundDue: true };
  },

  refund(order, event, now) {
    if (order.refundedAt !== null) fail("already_refunded", "order was already refunded");
    requireState(order, event, ["cancelled", "returned"]);
    if (!order.refundDue) fail("invalid_transition", "no refund is due for this order");
    return { refundedAt: now, refundDue: false };
  },
};

export function apply(order: Order, event: OrderEvent, now: string): Order {
  const handler = handlers[event.type] as (order: Order, event: OrderEvent, now: string) => Changes;
  const changes = handler(order, event, now);
  return {
    ...order,
    ...changes,
    history: [...order.history, { type: event.type, at: now }],
  };
}
