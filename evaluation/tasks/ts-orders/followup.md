Orders sometimes need a manual review before they go out. Add an "on hold" step to the order lifecycle in `src/orders.ts`. Everything that works today must keep working exactly as it does.

- Add the state `"on_hold"` to `OrderState`.
- Add two events to `OrderEvent`: `{ type: "holdForReview"; reason: string }` and `{ type: "review"; approved: boolean }`.
- Add two fields to `Order`: `heldFrom: "paid" | "packed" | null` and `holdReason: string | null`. `createOrder` sets both to `null`.

Rules (same conventions as the other events: a new order is returned, the input is never modified, each successful event appends `{ type, at: now }` to `history`, failures throw `OrderError` and change nothing):

- `holdForReview { reason }` is allowed only from `paid` or `packed`; otherwise `"invalid_transition"`. It moves the order to `on_hold`, sets `heldFrom` to the state the order was in, and sets `holdReason = reason`.
- `review { approved }` is allowed only from `on_hold`; otherwise `"invalid_transition"`.
  - `approved: true`: the order goes back to the state it was held from (`heldFrom`).
  - `approved: false`: the order moves to `cancelled` with `refundDue = true` and `cancelReason` set to the hold reason.
  - In both cases `heldFrom` and `holdReason` are set back to `null`.
- While an order is `on_hold`, every other event (`pay`, `pack`, `ship`, `deliver`, `cancel`, `requestReturn`, `refund`, and another `holdForReview`) throws `"invalid_transition"`. In particular an order on hold can never be shipped.

Add tests for the new behaviour to `src/orders.test.ts` and make sure `node --test` passes.
