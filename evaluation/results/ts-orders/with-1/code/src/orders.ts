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

const ALLOWED_FROM: Record<OrderEvent["type"], OrderState[]> = {
  pay: ["created"],
  pack: ["paid"],
  ship: ["packed"],
  deliver: ["shipped"],
  cancel: ["created", "paid", "packed"],
  requestReturn: ["delivered"],
  refund: ["cancelled", "returned"],
};

function invalidTransition(order: Order, event: OrderEvent): OrderError {
  return new OrderError(
    "invalid_transition",
    `cannot apply ${event.type} in state ${order.state}`,
  );
}

function checkPay(order: Order, amount: number): void {
  if (amount !== order.total) {
    throw new OrderError("amount_mismatch", "amount does not match total");
  }
}

function checkShip(carrier: string, tracking: string): void {
  if (carrier.trim() === "") {
    throw new OrderError("missing_carrier", "carrier is required");
  }
  if (tracking.trim() === "") {
    throw new OrderError("missing_tracking", "tracking is required");
  }
}

function checkReturnWindow(order: Order, now: string): void {
  const elapsed = Date.parse(now) - Date.parse(order.deliveredAt as string);
  if (elapsed > RETURN_WINDOW_MS) {
    throw new OrderError("return_window_closed", "return window closed");
  }
}

function changes(order: Order, event: OrderEvent, now: string): Partial<Order> {
  switch (event.type) {
    case "pay":
      checkPay(order, event.amount);
      return { state: "paid", paidAt: now };
    case "pack":
      return { state: "packed" };
    case "ship":
      checkShip(event.carrier, event.tracking);
      return { state: "shipped", carrier: event.carrier, tracking: event.tracking };
    case "deliver":
      return { state: "delivered", deliveredAt: now };
    case "cancel":
      return {
        state: "cancelled",
        cancelReason: event.reason,
        refundDue: order.paidAt !== null || order.refundDue,
      };
    case "requestReturn":
      checkReturnWindow(order, now);
      return { state: "returned", returnReason: event.reason, refundDue: true };
    case "refund":
      return { refundedAt: now, refundDue: false };
  }
}

export function apply(order: Order, event: OrderEvent, now: string): Order {
  if (event.type === "refund" && order.refundedAt !== null) {
    throw new OrderError("already_refunded", "order already refunded");
  }
  if (!ALLOWED_FROM[event.type].includes(order.state)) {
    throw invalidTransition(order, event);
  }
  if (event.type === "refund" && !order.refundDue) {
    throw invalidTransition(order, event);
  }
  return {
    ...order,
    ...changes(order, event, now),
    history: [...order.history, { type: event.type, at: now }],
  };
}
