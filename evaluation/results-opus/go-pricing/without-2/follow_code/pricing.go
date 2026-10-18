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
	// GiftCardBalance is applied to the total after tax.
	GiftCardBalance int
}

// QuoteResult is the price breakdown of an order, in integer cents.
type QuoteResult struct {
	Subtotal     int
	Discount     int
	Shipping     int
	Tax          int
	GiftCardUsed int
	Total        int
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

type regionRates struct {
	base, perStep, taxPercent int
}

var regions = map[string]regionRates{
	"EU": {base: 500, perStep: 200, taxPercent: 21},
	"US": {base: 700, perStep: 300, taxPercent: 0},
	"UK": {base: 600, perStep: 250, taxPercent: 20},
	"CA": {base: 800, perStep: 350, taxPercent: 13},
}

// Quote computes the price breakdown of an order.
func Quote(o Order) (QuoteResult, error) {
	var counted []Item
	for _, it := range o.Items {
		if it.Qty > 0 {
			counted = append(counted, it)
		}
	}

	for _, it := range counted {
		if it.UnitPrice < 0 || it.WeightGrams < 0 {
			return QuoteResult{}, ErrInvalidItem
		}
	}
	if o.GiftCardBalance < 0 {
		return QuoteResult{}, ErrInvalidGiftCard
	}
	switch o.Coupon {
	case "", "SAVE10", "FLAT5", "SPRING":
	default:
		return QuoteResult{}, ErrUnknownCoupon
	}
	rates, ok := regions[o.Customer.Region]
	if !ok {
		return QuoteResult{}, ErrUnknownRegion
	}

	if len(counted) == 0 {
		return QuoteResult{}, nil
	}

	subtotal, memberDiscount, totalQty, weight := 0, 0, 0, 0
	for _, it := range counted {
		line := it.UnitPrice * it.Qty
		subtotal += line
		totalQty += it.Qty
		weight += it.WeightGrams * it.Qty
		if o.Customer.Member {
			switch {
			case it.Category == "books" || it.Category == "music":
				memberDiscount += line * 10 / 100
			case it.UnitPrice >= 10000:
				memberDiscount += line * 5 / 100
			}
		}
	}

	amount := subtotal - memberDiscount
	if totalQty >= 10 {
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
		if o.Today != "" && "2026-03-01" <= o.Today && o.Today <= "2026-05-31" {
			amount -= amount * 15 / 100
		}
	}

	shipping := rates.base
	if weight > 1000 {
		shipping += rates.perStep * ((weight - 1000 + 999) / 1000)
	}
	if (o.Customer.Member && amount >= 10000) || (!o.Customer.Member && amount >= 15000) {
		shipping = 0
	}

	tax := ((amount+shipping)*rates.taxPercent + 50) / 100

	total := amount + shipping + tax
	giftCardUsed := o.GiftCardBalance
	if giftCardUsed > total {
		giftCardUsed = total
	}

	return QuoteResult{
		Subtotal:     subtotal,
		Discount:     subtotal - amount,
		Shipping:     shipping,
		Tax:          tax,
		GiftCardUsed: giftCardUsed,
		Total:        total - giftCardUsed,
	}, nil
}
