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

type regionRate struct{ base, per, taxPct int }

var regionRates = map[string]regionRate{
	"EU": {500, 200, 21},
	"US": {700, 300, 0},
	"UK": {600, 250, 20},
	"CA": {800, 350, 13},
}

func lineDiscount(it Item, line int) int {
	switch {
	case it.Category == "books" || it.Category == "music":
		return line * 10 / 100
	case it.UnitPrice >= 10000:
		return line * 5 / 100
	}
	return 0
}

func applyCoupon(code, today string, amount int) int {
	switch code {
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

func countedItems(items []Item) ([]Item, error) {
	var counted []Item
	for _, it := range items {
		if it.Qty <= 0 {
			continue
		}
		if it.UnitPrice < 0 || it.WeightGrams < 0 {
			return nil, ErrInvalidItem
		}
		counted = append(counted, it)
	}
	return counted, nil
}

func validCoupon(code string) bool {
	switch code {
	case "", "SAVE10", "FLAT5", "SPRING":
		return true
	}
	return false
}

func shippingCost(rate regionRate, weight, amount int, member bool) int {
	freeFrom := 15000
	if member {
		freeFrom = 10000
	}
	if amount >= freeFrom {
		return 0
	}
	if weight <= 1000 {
		return rate.base
	}
	return rate.base + rate.per*((weight-1000+999)/1000)
}

// Quote computes the price breakdown of an order.
func Quote(o Order) (QuoteResult, error) {
	counted, err := countedItems(o.Items)
	if err != nil {
		return QuoteResult{}, err
	}
	if o.GiftCardBalance < 0 {
		return QuoteResult{}, ErrInvalidGiftCard
	}
	if !validCoupon(o.Coupon) {
		return QuoteResult{}, ErrUnknownCoupon
	}
	rate, ok := regionRates[o.Customer.Region]
	if !ok {
		return QuoteResult{}, ErrUnknownRegion
	}
	if len(counted) == 0 {
		return QuoteResult{}, nil
	}

	subtotal, memberDisc, qty, weight := 0, 0, 0, 0
	for _, it := range counted {
		line := it.UnitPrice * it.Qty
		subtotal += line
		if o.Customer.Member {
			memberDisc += lineDiscount(it, line)
		}
		qty += it.Qty
		weight += it.WeightGrams * it.Qty
	}
	amount := subtotal - memberDisc
	if qty >= 10 {
		amount -= amount * 3 / 100
	}
	amount = applyCoupon(o.Coupon, o.Today, amount)

	shipping := shippingCost(rate, weight, amount, o.Customer.Member)
	x := amount + shipping
	tax := (x*rate.taxPct + 50) / 100
	before := x + tax
	used := min(o.GiftCardBalance, before)
	return QuoteResult{
		Subtotal:     subtotal,
		Discount:     subtotal - amount,
		Shipping:     shipping,
		Tax:          tax,
		Total:        before - used,
		GiftCardUsed: used,
	}, nil
}
