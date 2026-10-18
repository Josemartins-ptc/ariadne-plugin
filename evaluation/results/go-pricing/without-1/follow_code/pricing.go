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

	GiftCardBalance int // cents
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

// Quote computes the price breakdown of an order.
func Quote(o Order) (QuoteResult, error) {
	var items []Item
	for _, it := range o.Items {
		if it.Qty <= 0 {
			continue
		}
		if it.UnitPrice < 0 || it.WeightGrams < 0 {
			return QuoteResult{}, ErrInvalidItem
		}
		items = append(items, it)
	}
	if o.GiftCardBalance < 0 {
		return QuoteResult{}, ErrInvalidGiftCard
	}
	switch o.Coupon {
	case "", "SAVE10", "FLAT5", "SPRING":
	default:
		return QuoteResult{}, ErrUnknownCoupon
	}
	var base, per, rate int
	switch o.Customer.Region {
	case "EU":
		base, per, rate = 500, 200, 21
	case "US":
		base, per, rate = 700, 300, 0
	case "UK":
		base, per, rate = 600, 250, 20
	case "CA":
		base, per, rate = 800, 350, 13
	default:
		return QuoteResult{}, ErrUnknownRegion
	}
	if len(items) == 0 {
		return QuoteResult{}, nil
	}

	subtotal, qty, weight, memberDisc := 0, 0, 0, 0
	for _, it := range items {
		line := it.UnitPrice * it.Qty
		subtotal += line
		qty += it.Qty
		weight += it.WeightGrams * it.Qty
		if o.Customer.Member {
			if it.Category == "books" || it.Category == "music" {
				memberDisc += line * 10 / 100
			} else if it.UnitPrice >= 10000 {
				memberDisc += line * 5 / 100
			}
		}
	}
	amount := subtotal - memberDisc
	if qty >= 10 {
		amount -= amount * 3 / 100
	}
	switch o.Coupon {
	case "SAVE10":
		if amount >= 5000 {
			amount -= amount * 10 / 100
		}
	case "FLAT5":
		if amount >= 2000 {
			amount -= 500
		}
	case "SPRING":
		if o.Today >= "2026-03-01" && o.Today <= "2026-05-31" {
			amount -= amount * 15 / 100
		}
	}

	shipping := base
	if weight > 1000 {
		shipping += per * ((weight - 1000 + 999) / 1000)
	}
	if (o.Customer.Member && amount >= 10000) || (!o.Customer.Member && amount >= 15000) {
		shipping = 0
	}

	tax := ((amount+shipping)*rate + 50) / 100
	pre := amount + shipping + tax
	gift := min(o.GiftCardBalance, max(pre, 0))
	return QuoteResult{
		Subtotal:     subtotal,
		Discount:     subtotal - amount,
		Shipping:     shipping,
		Tax:          tax,
		GiftCardUsed: gift,
		Total:        pre - gift,
	}, nil
}
