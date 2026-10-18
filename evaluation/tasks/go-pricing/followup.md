# Gift cards and a new region

Please extend `Quote` in `pricing.go` with two changes. Every existing rule stays as it is unless stated here.

## 1. Gift cards

- Add a field `GiftCardBalance int` (cents) to `Order`, and a field `GiftCardUsed int` (cents) to `QuoteResult`.
- Add a new exported error `ErrInvalidGiftCard`. A negative `GiftCardBalance` returns `ErrInvalidGiftCard` with a zero `QuoteResult`. This check runs after the invalid-item check and before the coupon check, so the validation order becomes: invalid item, invalid gift card, unknown coupon, unknown region. Like the other checks, it also runs when the order has no counted items.
- The gift card is applied last, after tax: `GiftCardUsed = min(GiftCardBalance, total before the gift card)` and `Total = total before the gift card - GiftCardUsed`. `Total` never goes below 0. The gift card does not change `Subtotal`, `Discount`, `Shipping` or `Tax`, and it does not affect the free-shipping thresholds.
- An order with no counted items still returns every field 0 (including `GiftCardUsed`), whatever the balance.

## 2. New region "CA"

Add the region `"CA"`: shipping base 800 plus 350 per started extra 1000 g above the first 1000 g, tax rate 13%. Free-shipping thresholds and tax rounding are the same as for the other regions. Region codes remain case-sensitive.

The existing tests in `pricing_test.go` must keep passing. Run them with:

```
go test ./...
```
