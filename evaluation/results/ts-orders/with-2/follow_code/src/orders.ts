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

type Handlers = {
  [K in OrderEvent["type"]]: (
    order: Order,
    event: Extract<OrderEvent, { type: K }>,
    now: string,
  ) => Partial<Order>;
};

function requireNonBlank(value: string, code: string, message: string): void {
  if (value.trim() === "") {
    throw new OrderError(code, message);
  }
}

function checkReturnWindow(order: Order, now: string): void {
  const elapsed = Date.parse(now) - Date.parse(order.deliveredAt as string);
  if (elapsed > RETURN_WINDOW_MS) {
    throw new OrderError("return_window_closed", "return window has closed");
  }
}

const HANDLERS: Handlers = {
  pay: (order, event, now) => {
    if (event.amount !== order.total) {
      throw new OrderError("amount_mismatch", "amount does not match total");
    }
    return { state: "paid", paidAt: now };
  },
  pack: () => ({ state: "packed" }),
  ship: (_order, event) => {
    requireNonBlank(event.carrier, "missing_carrier", "carrier is required");
    requireNonBlank(event.tracking, "missing_tracking", "tracking is required");
    return { state: "shipped", carrier: event.carrier, tracking: event.tracking };
  },
  deliver: (_order, _event, now) => ({ state: "delivered", deliveredAt: now }),
  cancel: (order, event) => ({
    state: "cancelled",
    cancelReason: event.reason,
    refundDue: order.refundDue || order.paidAt !== null,
  }),
  requestReturn: (order, event, now) => {
    checkReturnWindow(order, now);
    return { state: "returned", returnReason: event.reason, refundDue: true };
  },
  refund: (_order, _event, now) => ({ refundedAt: now, refundDue: false }),
  holdForReview: (order, event) => ({
    state: "on_hold",
    heldFrom: order.state as "paid" | "packed",
    holdReason: event.reason,
  }),
  review: (order, event) =>
    event.approved
      ? { state: order.heldFrom as "paid" | "packed", heldFrom: null, holdReason: null }
      : {
          state: "cancelled",
          refundDue: true,
          cancelReason: order.holdReason,
          heldFrom: null,
          holdReason: null,
        },
};

function transition(order: Order, event: OrderEvent, now: string): Partial<Order> {
  const handler = HANDLERS[event.type] as (
    order: Order,
    event: OrderEvent,
    now: string,
  ) => Partial<Order>;
  return handler(order, event, now);
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
  const changes = transition(order, event, now);
  return {
    ...order,
    ...changes,
    history: [...order.history, { type: event.type, at: now }],
  };
}
