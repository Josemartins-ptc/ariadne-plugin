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

	GiftCardBalance int
}

// QuoteResult is the price breakdown of an order, in integer cents.
type QuoteResult struct {
	Subtotal int
	Discount int
	Shipping int
	Tax      int
	Total    int

	GiftCardUsed int
}

var (
	// ErrInvalidItem is returned when an item has a negative unit price or weight.
	ErrInvalidItem = errors.New("invalid item")
	// ErrInvalidGiftCard is returned when the gift card balance is negative.
	ErrInvalidGiftCard = errors.New("invalid gift card")
	// ErrUnknownCoupon is returned for a coupon code that does not exist.
	ErrUnknownCoupon = errors.New("unknown coupon")
	// ErrUnknownRegion is returned for a customer region that is not supported.
	ErrUnknownRegion = errors.New("unknown region")
)

// regionInfo holds the shipping and tax parameters of a region.
type regionInfo struct {
	base, perStep, taxRate int
}

var regions = map[string]regionInfo{
	"EU": {base: 500, perStep: 200, taxRate: 21},
	"US": {base: 700, perStep: 300, taxRate: 0},
	"UK": {base: 600, perStep: 250, taxRate: 20},
	"CA": {base: 800, perStep: 350, taxRate: 13},
}

var knownCoupons = map[string]bool{"": true, "SAVE10": true, "FLAT5": true, "SPRING": true}

// Quote computes the price breakdown of an order.
func Quote(o Order) (QuoteResult, error) {
	counted := countedItems(o.Items)
	if err := validate(o, counted); err != nil {
		return QuoteResult{}, err
	}
	if len(counted) == 0 {
		return QuoteResult{}, nil
	}
	region := regions[o.Customer.Region]

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

	shipping := shippingCost(region, weight)
	if (o.Customer.Member && amount >= 10000) || (!o.Customer.Member && amount >= 15000) {
		shipping = 0
	}

	tax := ((amount+shipping)*region.taxRate + 50) / 100

	// The gift card is applied last, after tax.
	total := amount + shipping + tax
	giftCard := min(o.GiftCardBalance, max(total, 0))
	total -= giftCard

	return QuoteResult{
		Subtotal:     subtotal,
		Discount:     subtotal - amount,
		Shipping:     shipping,
		Tax:          tax,
		Total:        total,
		GiftCardUsed: giftCard,
	}, nil
}

// countedItems returns the items with a positive quantity.
func countedItems(items []Item) []Item {
	var counted []Item
	for _, it := range items {
		if it.Qty > 0 {
			counted = append(counted, it)
		}
	}
	return counted
}

// validate checks the order and returns the first error found.
func validate(o Order, counted []Item) error {
	for _, it := range counted {
		if it.UnitPrice < 0 || it.WeightGrams < 0 {
			return ErrInvalidItem
		}
	}
	if o.GiftCardBalance < 0 {
		return ErrInvalidGiftCard
	}
	if !knownCoupons[o.Coupon] {
		return ErrUnknownCoupon
	}
	if _, ok := regions[o.Customer.Region]; !ok {
		return ErrUnknownRegion
	}
	return nil
}

// memberDiscount returns the sum of the per-line member discounts.
func memberDiscount(counted []Item) int {
	total := 0
	for _, it := range counted {
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

// applyCoupon applies the coupon to amount when its condition is met.
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

// shippingCost returns the shipping cost for the total weight in grams.
func shippingCost(r regionInfo, weight int) int {
	if weight <= 1000 {
		return r.base
	}
	steps := (weight - 1000 + 999) / 1000
	return r.base + r.perStep*steps
}
