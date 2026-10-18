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

type shippingRate struct{ base, per, taxPct int }

var regionRates = map[string]shippingRate{
	"EU": {500, 200, 21},
	"US": {700, 300, 0},
	"UK": {600, 250, 20},
	"CA": {800, 350, 13},
}

func validate(o Order) error {
	for _, it := range o.Items {
		if it.Qty > 0 && (it.UnitPrice < 0 || it.WeightGrams < 0) {
			return ErrInvalidItem
		}
	}
	if o.GiftCardBalance < 0 {
		return ErrInvalidGiftCard
	}
	switch o.Coupon {
	case "", "SAVE10", "FLAT5", "SPRING":
	default:
		return ErrUnknownCoupon
	}
	if _, ok := regionRates[o.Customer.Region]; !ok {
		return ErrUnknownRegion
	}
	return nil
}

func memberDiscount(it Item) int {
	line := it.UnitPrice * it.Qty
	switch {
	case it.Category == "books" || it.Category == "music":
		return line * 10 / 100
	case it.UnitPrice >= 10000:
		return line * 5 / 100
	}
	return 0
}

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
		if today >= "2026-03-01" && today <= "2026-05-31" {
			return amount - amount*15/100
		}
	}
	return amount
}

// Quote computes the price breakdown of an order.
func Quote(o Order) (QuoteResult, error) {
	if err := validate(o); err != nil {
		return QuoteResult{}, err
	}
	var subtotal, memberDisc, qty, weight int
	for _, it := range o.Items {
		if it.Qty <= 0 {
			continue
		}
		subtotal += it.UnitPrice * it.Qty
		qty += it.Qty
		weight += it.WeightGrams * it.Qty
		if o.Customer.Member {
			memberDisc += memberDiscount(it)
		}
	}
	if qty == 0 {
		return QuoteResult{}, nil
	}
	amount := subtotal - memberDisc
	if qty >= 10 {
		amount -= amount * 3 / 100
	}
	amount = applyCoupon(amount, o.Coupon, o.Today)

	rate := regionRates[o.Customer.Region]
	shipping := rate.base
	if weight > 1000 {
		shipping += rate.per * ((weight - 1000 + 999) / 1000)
	}
	if (o.Customer.Member && amount >= 10000) || (!o.Customer.Member && amount >= 15000) {
		shipping = 0
	}
	tax := ((amount+shipping)*rate.taxPct + 50) / 100
	before := amount + shipping + tax
	used := o.GiftCardBalance
	if used > before {
		used = before
	}
	return QuoteResult{
		Subtotal:     subtotal,
		Discount:     subtotal - amount,
		Shipping:     shipping,
		Tax:          tax,
		Total:        before - used,
		GiftCardUsed: used,
	}, nil
}
