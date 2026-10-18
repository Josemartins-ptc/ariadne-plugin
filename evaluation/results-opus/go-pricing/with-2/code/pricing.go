// Package pricing computes price quotes for shopping orders.
package pricing

import "errors"

// Item is one order line. Money amounts are integer cents.
type Item struct {
	SKU         string
	Category    string
	UnitPrice   int
	Qty         int
	WeightGrams int
}

// Customer describes who places the order.
type Customer struct {
	Member bool
	Region string
}

// Order is the input to Quote.
type Order struct {
	Items    []Item
	Customer Customer
	Coupon   string
	Today    string // YYYY-MM-DD
}

// QuoteResult is the price breakdown of an order, in integer cents.
type QuoteResult struct {
	Subtotal int
	Discount int
	Shipping int
	Tax      int
	Total    int
}

var (
	// ErrInvalidItem is returned when an item has a negative unit price or weight.
	ErrInvalidItem = errors.New("invalid item")
	// ErrUnknownCoupon is returned for a coupon code that does not exist.
	ErrUnknownCoupon = errors.New("unknown coupon")
	// ErrUnknownRegion is returned for a customer region that is not supported.
	ErrUnknownRegion = errors.New("unknown region")
)

// regionRates holds per-region shipping and tax parameters.
type regionRates struct {
	base    int // shipping for up to 1000 g
	perStep int // shipping per started extra 1000 g
	taxPct  int
}

var regions = map[string]regionRates{
	"EU": {base: 500, perStep: 200, taxPct: 21},
	"US": {base: 700, perStep: 300, taxPct: 0},
	"UK": {base: 600, perStep: 250, taxPct: 20},
}

var knownCoupons = map[string]bool{"": true, "SAVE10": true, "FLAT5": true, "SPRING": true}

// Quote computes the price breakdown of an order.
func Quote(o Order) (QuoteResult, error) {
	counted := countedItems(o.Items)
	for _, it := range counted {
		if it.UnitPrice < 0 || it.WeightGrams < 0 {
			return QuoteResult{}, ErrInvalidItem
		}
	}
	if !knownCoupons[o.Coupon] {
		return QuoteResult{}, ErrUnknownCoupon
	}
	rates, ok := regions[o.Customer.Region]
	if !ok {
		return QuoteResult{}, ErrUnknownRegion
	}
	if len(counted) == 0 {
		return QuoteResult{}, nil
	}

	subtotal, totalQty, weight := 0, 0, 0
	for _, it := range counted {
		subtotal += it.UnitPrice * it.Qty
		totalQty += it.Qty
		weight += it.WeightGrams * it.Qty
	}

	amount := subtotal
	if o.Customer.Member {
		amount -= memberDiscount(counted)
	}
	if totalQty >= 10 {
		amount -= amount * 3 / 100
	}
	amount = applyCoupon(amount, o.Coupon, o.Today)

	shipping := shippingCost(rates, weight)
	if (o.Customer.Member && amount >= 10000) || (!o.Customer.Member && amount >= 15000) {
		shipping = 0
	}

	tax := ((amount+shipping)*rates.taxPct + 50) / 100

	return QuoteResult{
		Subtotal: subtotal,
		Discount: subtotal - amount,
		Shipping: shipping,
		Tax:      tax,
		Total:    amount + shipping + tax,
	}, nil
}

// countedItems returns the items with a positive quantity.
func countedItems(items []Item) []Item {
	var out []Item
	for _, it := range items {
		if it.Qty > 0 {
			out = append(out, it)
		}
	}
	return out
}

// memberDiscount returns the summed per-line member discount.
func memberDiscount(items []Item) int {
	total := 0
	for _, it := range items {
		line := it.UnitPrice * it.Qty
		switch {
		case it.Category == "books" || it.Category == "music":
			total += line * 10 / 100
		case it.UnitPrice >= 10000:
			total += line * 5 / 100
		}
	}
	return total
}

// applyCoupon returns amount after applying the coupon, if its condition holds.
func applyCoupon(amount int, coupon, today string) int {
	switch coupon {
	case "SAVE10":
		if amount >= 5000 {
			return amount - amount*10/100
		}
	case "FLAT5":
		if amount >= 2000 {
			return amount - 500
		}
	case "SPRING":
		if today != "" && today >= "2026-03-01" && today <= "2026-05-31" {
			return amount - amount*15/100
		}
	}
	return amount
}

// shippingCost returns the weight-based shipping before any free-shipping rule.
func shippingCost(r regionRates, weight int) int {
	if weight <= 1000 {
		return r.base
	}
	steps := (weight - 1000 + 999) / 1000
	return r.base + r.perStep*steps
}
