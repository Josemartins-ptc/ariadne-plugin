Implement the order lifecycle in `src/orders.ts`. The types (`OrderState`, `OrderEvent`, `HistoryEntry`, `Order`) and the `OrderError` class are already there; keep their shapes as they are. Implement the two stub functions, `createOrder` and `apply`.

## `createOrder(id: string, total: number): Order`

Returns a new order in state `"created"` with the given `id` and `total`, an empty `history`, `refundDue: false`, and every other field (`paidAt`, `carrier`, `tracking`, `deliveredAt`, `cancelReason`, `returnReason`, `refundedAt`) set to `null`.

## `apply(order: Order, event: OrderEvent, now: string): Order`

Applies one event to an order. `now` is an ISO 8601 timestamp (for example `"2026-03-01T10:00:00.000Z"`) and is stored exactly as given wherever a rule below says "`now`".

- On success, `apply` returns a **new** order object. The input order and its `history` array must never be modified. Fields not mentioned by a rule keep their values.
- Every successful event appends `{ type: event.type, at: now }` to the end of `history` (in the returned order only).
- On failure, `apply` throws an `OrderError` whose `code` is one of the codes below, and nothing changes.
- Checks run in this order: first whether the event is allowed in the order's current state (otherwise `"invalid_transition"`), then the event-specific checks listed for it, in the order listed.

### Events

| Event | Allowed from | Checks (in order) | Effect on success |
|---|---|---|---|
| `pay { amount }` | `created` | `amount` must be exactly equal (`===`) to `order.total`, else `"amount_mismatch"` | state `paid`; `paidAt = now` |
| `pack` | `paid` | — | state `packed` |
| `ship { carrier, tracking }` | `packed` | `carrier` empty or only whitespace → `"missing_carrier"`; then `tracking` empty or only whitespace → `"missing_tracking"` | state `shipped`; `carrier` and `tracking` stored exactly as given (not trimmed) |
| `deliver` | `shipped` | — | state `delivered`; `deliveredAt = now` |
| `cancel { reason }` | `created`, `paid`, `packed` | — | state `cancelled`; `cancelReason = reason`; `refundDue = true` if the order had been paid (`paidAt` is not `null`), otherwise `refundDue` stays `false` |
| `requestReturn { reason }` | `delivered` | `now` must be at most 30 days (30 × 24 hours) after `deliveredAt`; exactly 30 days later is still allowed; one millisecond more → `"return_window_closed"`. Compare the instants, i.e. `Date.parse(now) - Date.parse(deliveredAt)` | state `returned`; `returnReason = reason`; `refundDue = true` |
| `refund` | see below | see below | state unchanged; `refundedAt = now`; `refundDue = false` |

`refund` is checked like this, in this order:
1. If the order has already been refunded (`refundedAt` is not `null`), throw `"already_refunded"` (whatever the state).
2. Otherwise it is allowed only when the state is `cancelled` or `returned` **and** `refundDue` is `true`; anything else throws `"invalid_transition"` (for example refunding an order that was cancelled before it was paid, or a delivered order).

Any event sent in a state not listed in its "Allowed from" column throws `"invalid_transition"` (for example `cancel` after `shipped`, `ship` from `paid`, or `pay` on an already paid order, even with a wrong amount).

### Errors

`OrderError` (already defined) has a `code` string field and `name === "OrderError"`. The message is free text. The codes are exactly: `"invalid_transition"`, `"amount_mismatch"`, `"missing_carrier"`, `"missing_tracking"`, `"return_window_closed"`, `"already_refunded"`.

The visible tests are in `src/orders.test.ts`; run them with `node --test`.
