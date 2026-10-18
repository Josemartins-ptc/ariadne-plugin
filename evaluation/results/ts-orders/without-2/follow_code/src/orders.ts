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

const ALLOWED_FROM: Record<
  Exclude<OrderEvent["type"], "refund">,
  OrderState[]
> = {
  pay: ["created"],
  pack: ["paid"],
  ship: ["packed"],
  deliver: ["shipped"],
  cancel: ["created", "paid", "packed"],
  requestReturn: ["delivered"],
  holdForReview: ["paid", "packed"],
  review: ["on_hold"],
};

const RETURN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function invalid(order: Order, event: OrderEvent): OrderError {
  return new OrderError(
    "invalid_transition",
    `cannot apply ${event.type} in state ${order.state}`,
  );
}

export function apply(order: Order, event: OrderEvent, now: string): Order {
  let changes: Partial<Order>;

  if (event.type === "refund") {
    if (order.refundedAt !== null) {
      throw new OrderError("already_refunded", "order already refunded");
    }
    if (
      !(order.state === "cancelled" || order.state === "returned") ||
      !order.refundDue
    ) {
      throw invalid(order, event);
    }
    changes = { refundedAt: now, refundDue: false };
  } else {
    if (!ALLOWED_FROM[event.type].includes(order.state)) {
      throw invalid(order, event);
    }
    switch (event.type) {
      case "pay":
        if (event.amount !== order.total) {
          throw new OrderError("amount_mismatch", "amount does not match total");
        }
        changes = { state: "paid", paidAt: now };
        break;
      case "pack":
        changes = { state: "packed" };
        break;
      case "ship":
        if (event.carrier.trim() === "") {
          throw new OrderError("missing_carrier", "carrier is required");
        }
        if (event.tracking.trim() === "") {
          throw new OrderError("missing_tracking", "tracking is required");
        }
        changes = {
          state: "shipped",
          carrier: event.carrier,
          tracking: event.tracking,
        };
        break;
      case "deliver":
        changes = { state: "delivered", deliveredAt: now };
        break;
      case "cancel":
        changes = {
          state: "cancelled",
          cancelReason: event.reason,
          refundDue: order.paidAt !== null ? true : order.refundDue,
        };
        break;
      case "requestReturn":
        if (
          Date.parse(now) - Date.parse(order.deliveredAt as string) >
          RETURN_WINDOW_MS
        ) {
          throw new OrderError(
            "return_window_closed",
            "return window has closed",
          );
        }
        changes = {
          state: "returned",
          returnReason: event.reason,
          refundDue: true,
        };
        break;
      case "holdForReview":
        changes = {
          state: "on_hold",
          heldFrom: order.state as "paid" | "packed",
          holdReason: event.reason,
        };
        break;
      case "review":
        changes = event.approved
          ? {
              state: order.heldFrom as "paid" | "packed",
              heldFrom: null,
              holdReason: null,
            }
          : {
              state: "cancelled",
              cancelReason: order.holdReason,
              refundDue: true,
              heldFrom: null,
              holdReason: null,
            };
        break;
    }
  }

  return {
    ...order,
    ...changes,
    history: [...order.history, { type: event.type, at: now }],
  };
}
