# Implement order pricing

This repository is the Go module `example.com/gopricing`. Package `pricing` lives in `pricing.go`, which already declares the types, the three error values and a stub `Quote`. Implement `Quote` so it follows the rules below exactly. Keep the existing type, field and error names unchanged (you may add unexported helpers). Use only the standard library.

```go
type Item struct {
	SKU         string
	Category    string
	UnitPrice   int // cents
	Qty         int
	WeightGrams int // weight of one unit
}
type Customer struct {
	Member bool
	Region string
}
type Order struct {
	Items    []Item
	Customer Customer
	Coupon   string
	Today    string // YYYY-MM-DD
}
type QuoteResult struct {
	Subtotal, Discount, Shipping, Tax, Total int // cents
}
var ErrInvalidItem, ErrUnknownCoupon, ErrUnknownRegion error // already declared
func Quote(o Order) (QuoteResult, error)
```

All money is integer cents. Never use floating point. "Divide" always means Go integer division of non-negative numbers (rounds down), except for tax, which has its own rounding rule below. All string comparisons (categories, coupon codes, regions) are exact and case-sensitive.

## 1. Counted items

An item with `Qty <= 0` is ignored completely: it is not validated, and it contributes nothing to any amount, quantity or weight. Every other item is a *counted item*.

## 2. Validation (errors), in this order

Check these in this order and return the first error found, with a zero `QuoteResult`. Return the exported error value itself (callers test with `errors.Is`).

1. Any counted item with `UnitPrice < 0` or `WeightGrams < 0` → `ErrInvalidItem`.
2. `Coupon` is not one of `""`, `"SAVE10"`, `"FLAT5"`, `"SPRING"` → `ErrUnknownCoupon`.
3. `Customer.Region` is not one of `"EU"`, `"US"`, `"UK"` → `ErrUnknownRegion`.

All three checks run even when the order has no counted items.

## 3. Empty order

If there are no counted items (and no error from section 2), return a `QuoteResult` with every field 0 and a nil error. No shipping is charged.

## 4. Subtotal

`Subtotal` = sum over counted items of `UnitPrice * Qty`. Call `UnitPrice * Qty` the item's *line amount*.

## 5. Discounts, in this order

Start from `amount = Subtotal`.

**a. Member discount** (only when `Customer.Member` is true), computed per counted item on its line amount:
- `Category` is `"books"` or `"music"`: line discount = `line * 10 / 100`.
- otherwise, if `UnitPrice >= 10000`: line discount = `line * 5 / 100`.
- otherwise: no line discount.

Subtract the sum of the line discounts from `amount`.

**b. Volume discount**: if the sum of `Qty` over counted items is `>= 10`, then `amount = amount - amount * 3 / 100` (using `amount` after step a). Applies to members and non-members.

**c. Coupon** (using `amount` after step b; a known coupon whose condition is not met is silently ignored, no error):
- `""`: no coupon.
- `"SAVE10"`: if `amount >= 5000`, then `amount = amount - amount * 10 / 100`.
- `"FLAT5"`: if `amount >= 2000`, then `amount = amount - 500`.
- `"SPRING"`: if `"2026-03-01" <= Today <= "2026-05-31"` (inclusive both ends, compared as strings; `Today` is always either empty or in `YYYY-MM-DD` form, and an empty `Today` is never in range), then `amount = amount - amount * 15 / 100`.

The result is the *discounted amount*. `Discount` = `Subtotal - discounted amount`.

## 6. Shipping

Total weight `W` = sum over counted items of `WeightGrams * Qty`.

| Region | base | per started extra 1000 g |
|--------|------|--------------------------|
| EU     | 500  | 200                      |
| US     | 700  | 300                      |
| UK     | 600  | 250                      |

- If `W <= 1000`: shipping = base (including `W == 0`).
- Otherwise: shipping = base + per × ceil((W − 1000) / 1000). For example `W = 1001` adds 1 step, `W = 2000` adds 1 step, `W = 2001` adds 2 steps.

Free shipping (`Shipping = 0`): when the customer is a member and the discounted amount is `>= 10000`, or the customer is not a member and the discounted amount is `>= 15000`.

## 7. Tax

Tax rate in percent: EU 21, UK 20, US 0. Let `x` = discounted amount + `Shipping`. `Tax = (x * rate + 50) / 100` (integer division; this rounds half up to the cent).

## 8. Total

`Total` = discounted amount + `Shipping` + `Tax`.

## Worked example

Member in EU, coupon `"SAVE10"`, items: one book at 2000 × 3 (500 g each), one gadget at 12000 × 1 (1500 g).
- Subtotal = 6000 + 12000 = 18000.
- Member: 6000·10/100 = 600, 12000·5/100 = 600 → amount 16800.
- Volume: total qty 4 < 10 → 16800.
- SAVE10: 16800 ≥ 5000 → 16800 − 1680 = 15120. Discount = 2880.
- Weight 3000 g → 500 + 200·2 = 900, but member and 15120 ≥ 10000 → Shipping 0.
- Tax = (15120·21 + 50)/100 = 3175. Total = 18295.

## Tests

The visible tests are in `pricing_test.go`. Run them with:

```
go test ./...
```
