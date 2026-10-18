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

// regionRates holds the shipping and tax parameters of a supported region.
type regionRates struct {
	base, perStep, taxPercent int
}

var regions = map[string]regionRates{
	"EU": {base: 500, perStep: 200, taxPercent: 21},
	"US": {base: 700, perStep: 300, taxPercent: 0},
	"UK": {base: 600, perStep: 250, taxPercent: 20},
	"CA": {base: 800, perStep: 350, taxPercent: 13},
}

var knownCoupons = map[string]bool{"": true, "SAVE10": true, "FLAT5": true, "SPRING": true}

// Quote computes the price breakdown of an order.
func Quote(o Order) (QuoteResult, error) {
	items := countedItems(o.Items)
	if err := validate(items, o); err != nil {
		return QuoteResult{}, err
	}
	if len(items) == 0 {
		return QuoteResult{}, nil
	}
	rates := regions[o.Customer.Region]

	subtotal := 0
	for _, it := range items {
		subtotal += it.UnitPrice * it.Qty
	}
	amount := discountedAmount(items, subtotal, o)
	shipping := shippingCost(items, rates, o.Customer.Member, amount)
	tax := ((amount+shipping)*rates.taxPercent + 50) / 100
	total := amount + shipping + tax
	giftCardUsed := min(o.GiftCardBalance, total)

	return QuoteResult{
		Subtotal:     subtotal,
		Discount:     subtotal - amount,
		Shipping:     shipping,
		Tax:          tax,
		Total:        total - giftCardUsed,
		GiftCardUsed: giftCardUsed,
	}, nil
}

// countedItems returns the items with a positive quantity.
func countedItems(all []Item) []Item {
	var items []Item
	for _, it := range all {
		if it.Qty > 0 {
			items = append(items, it)
		}
	}
	return items
}

// validate checks the counted items, gift card, coupon and region, in that order.
func validate(items []Item, o Order) error {
	for _, it := range items {
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

// discountedAmount applies the member, volume and coupon discounts in order.
func discountedAmount(items []Item, subtotal int, o Order) int {
	amount := subtotal
	if o.Customer.Member {
		amount -= memberDiscount(items)
	}
	totalQty := 0
	for _, it := range items {
		totalQty += it.Qty
	}
	if totalQty >= 10 {
		amount -= amount * 3 / 100
	}
	return applyCoupon(amount, o.Coupon, o.Today)
}

// memberDiscount sums the per-line member discounts.
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

// applyCoupon applies a known coupon when its condition is met.
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

// shippingCost computes the weight-based shipping, or 0 when shipping is free.
func shippingCost(items []Item, rates regionRates, member bool, amount int) int {
	if (member && amount >= 10000) || (!member && amount >= 15000) {
		return 0
	}
	weight := 0
	for _, it := range items {
		weight += it.WeightGrams * it.Qty
	}
	if weight <= 1000 {
		return rates.base
	}
	steps := (weight - 1000 + 999) / 1000
	return rates.base + rates.perStep*steps
}
