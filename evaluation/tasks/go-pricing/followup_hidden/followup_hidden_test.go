package pricing

import (
	"errors"
	"testing"
)

func fuToy(price, qty, weight int) Item {
	return Item{SKU: "T", Category: "toys", UnitPrice: price, Qty: qty, WeightGrams: weight}
}

func fuExpectQuote(t *testing.T, o Order, want QuoteResult) {
	t.Helper()
	got, err := Quote(o)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func fuExpectErr(t *testing.T, o Order, want error) {
	t.Helper()
	got, err := Quote(o)
	if !errors.Is(err, want) {
		t.Fatalf("got error %v, want %v", err, want)
	}
	if got != (QuoteResult{}) {
		t.Fatalf("got %+v with error, want zero QuoteResult", got)
	}
}

func TestFollowupGiftCardPartiallyCoversTotal(t *testing.T) {
	fuExpectQuote(t, Order{Items: []Item{fuToy(1000, 1, 0)}, Customer: Customer{Region: "US"}, GiftCardBalance: 300},
		QuoteResult{Subtotal: 1000, Discount: 0, Shipping: 700, Tax: 0, Total: 1400, GiftCardUsed: 300})
}

func TestFollowupGiftCardCappedAtTotal(t *testing.T) {
	fuExpectQuote(t, Order{Items: []Item{fuToy(1000, 1, 0)}, Customer: Customer{Region: "US"}, GiftCardBalance: 5000},
		QuoteResult{Subtotal: 1000, Discount: 0, Shipping: 700, Tax: 0, Total: 0, GiftCardUsed: 1700})
}

func TestFollowupGiftCardExactlyTotal(t *testing.T) {
	fuExpectQuote(t, Order{Items: []Item{fuToy(1000, 1, 0)}, Customer: Customer{Region: "US"}, GiftCardBalance: 1700},
		QuoteResult{Subtotal: 1000, Discount: 0, Shipping: 700, Tax: 0, Total: 0, GiftCardUsed: 1700})
}

func TestFollowupZeroGiftCardBalanceUsesNothing(t *testing.T) {
	fuExpectQuote(t, Order{Items: []Item{fuToy(1000, 1, 0)}, Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 1000, Discount: 0, Shipping: 700, Tax: 0, Total: 1700, GiftCardUsed: 0})
}

func TestFollowupGiftCardAppliedAfterTax(t *testing.T) {
	// x = 1500 -> tax 315 on the full amount; total 1815 - 1000.
	fuExpectQuote(t, Order{Items: []Item{fuToy(1000, 1, 0)}, Customer: Customer{Region: "EU"}, GiftCardBalance: 1000},
		QuoteResult{Subtotal: 1000, Discount: 0, Shipping: 500, Tax: 315, Total: 815, GiftCardUsed: 1000})
}

func TestFollowupNegativeGiftCardIsInvalid(t *testing.T) {
	fuExpectErr(t, Order{Items: []Item{fuToy(1000, 1, 0)}, Customer: Customer{Region: "US"}, GiftCardBalance: -1}, ErrInvalidGiftCard)
	fuExpectErr(t, Order{Customer: Customer{Region: "US"}, GiftCardBalance: -1}, ErrInvalidGiftCard)
}

func TestFollowupGiftCardValidationOrder(t *testing.T) {
	fuExpectErr(t, Order{Items: []Item{fuToy(-1, 1, 0)}, Customer: Customer{Region: "US"}, GiftCardBalance: -1}, ErrInvalidItem)
	fuExpectErr(t, Order{Items: []Item{fuToy(100, 1, 0)}, Coupon: "NOPE", Customer: Customer{Region: "XX"}, GiftCardBalance: -1}, ErrInvalidGiftCard)
}

func TestFollowupEmptyOrderWithGiftCardIsAllZero(t *testing.T) {
	fuExpectQuote(t, Order{Customer: Customer{Region: "EU"}, GiftCardBalance: 1000}, QuoteResult{})
}

func TestFollowupCAShippingBaseAndTax(t *testing.T) {
	// x = 1800 -> (23400+50)/100 = 234.
	fuExpectQuote(t, Order{Items: []Item{fuToy(1000, 1, 1000)}, Customer: Customer{Region: "CA"}},
		QuoteResult{Subtotal: 1000, Discount: 0, Shipping: 800, Tax: 234, Total: 2034})
}

func TestFollowupCAShippingStartedKilogramSteps(t *testing.T) {
	// 2001 g -> 800 + 2*350 = 1500; x = 1600 -> tax 208.
	fuExpectQuote(t, Order{Items: []Item{fuToy(100, 1, 2001)}, Customer: Customer{Region: "CA"}},
		QuoteResult{Subtotal: 100, Discount: 0, Shipping: 1500, Tax: 208, Total: 1808})
}

func TestFollowupCATaxRoundsHalfUp(t *testing.T) {
	// x = 850 -> 110.5 -> 111.
	fuExpectQuote(t, Order{Items: []Item{fuToy(50, 1, 0)}, Customer: Customer{Region: "CA"}},
		QuoteResult{Subtotal: 50, Discount: 0, Shipping: 800, Tax: 111, Total: 961})
}

func TestFollowupCAFreeShippingThresholdsUnchanged(t *testing.T) {
	fuExpectQuote(t, Order{Items: []Item{fuToy(5000, 2, 2500)}, Customer: Customer{Member: true, Region: "CA"}},
		QuoteResult{Subtotal: 10000, Discount: 0, Shipping: 0, Tax: 1300, Total: 11300})
	// non-member below 15000: x = 15799 -> (205387+50)/100 = 2054.
	fuExpectQuote(t, Order{Items: []Item{fuToy(14999, 1, 0)}, Customer: Customer{Region: "CA"}},
		QuoteResult{Subtotal: 14999, Discount: 0, Shipping: 800, Tax: 2054, Total: 17853})
}

func TestFollowupCARegionIsCaseSensitive(t *testing.T) {
	fuExpectErr(t, Order{Items: []Item{fuToy(100, 1, 0)}, Customer: Customer{Region: "ca"}}, ErrUnknownRegion)
}

func TestFollowupCAWithCouponMemberAndGiftCard(t *testing.T) {
	// 18000 -> member 16800 -> SAVE10 15120; free shipping; tax (15120*13+50)/100 = 1966; 17086 - 10000.
	fuExpectQuote(t, Order{
		Items: []Item{
			{SKU: "B", Category: "books", UnitPrice: 2000, Qty: 3, WeightGrams: 500},
			{SKU: "E", Category: "gadgets", UnitPrice: 12000, Qty: 1, WeightGrams: 1500},
		},
		Coupon:          "SAVE10",
		Customer:        Customer{Member: true, Region: "CA"},
		GiftCardBalance: 10000,
	}, QuoteResult{Subtotal: 18000, Discount: 2880, Shipping: 0, Tax: 1966, Total: 7086, GiftCardUsed: 10000})
}
