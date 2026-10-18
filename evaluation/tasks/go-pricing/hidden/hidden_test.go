package pricing

import (
	"errors"
	"testing"
)

func usToy(price, qty, weight int) Item {
	return Item{SKU: "T", Category: "toys", UnitPrice: price, Qty: qty, WeightGrams: weight}
}

func expectQuote(t *testing.T, o Order, want QuoteResult) {
	t.Helper()
	got, err := Quote(o)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func expectErr(t *testing.T, o Order, want error) {
	t.Helper()
	got, err := Quote(o)
	if !errors.Is(err, want) {
		t.Fatalf("got error %v, want %v", err, want)
	}
	if got != (QuoteResult{}) {
		t.Fatalf("got %+v with error, want zero QuoteResult", got)
	}
}

func TestHiddenEmptyOrderIsAllZero(t *testing.T) {
	expectQuote(t, Order{Customer: Customer{Region: "EU"}}, QuoteResult{})
}

func TestHiddenNonPositiveQtyItemsIgnoredAndNotValidated(t *testing.T) {
	expectQuote(t, Order{
		Items: []Item{
			{SKU: "X", Category: "toys", UnitPrice: -5, Qty: 0, WeightGrams: -1},
			{SKU: "Y", Category: "toys", UnitPrice: 1000, Qty: -3, WeightGrams: 100},
		},
		Customer: Customer{Region: "UK"},
	}, QuoteResult{})
}

func TestHiddenEmptyOrderStillValidatesCouponAndRegion(t *testing.T) {
	expectErr(t, Order{Customer: Customer{Region: "XX"}}, ErrUnknownRegion)
	expectErr(t, Order{Coupon: "BOGUS", Customer: Customer{Region: "EU"}}, ErrUnknownCoupon)
}

func TestHiddenNegativePriceOrWeightIsInvalid(t *testing.T) {
	expectErr(t, Order{Items: []Item{usToy(-1, 1, 100)}, Customer: Customer{Region: "US"}}, ErrInvalidItem)
	expectErr(t, Order{Items: []Item{usToy(100, 1, 0), usToy(100, 2, -1)}, Customer: Customer{Region: "US"}}, ErrInvalidItem)
}

func TestHiddenValidationOrderItemThenCouponThenRegion(t *testing.T) {
	expectErr(t, Order{Items: []Item{usToy(-1, 1, 0)}, Coupon: "NOPE", Customer: Customer{Region: "XX"}}, ErrInvalidItem)
	expectErr(t, Order{Items: []Item{usToy(100, 1, 0)}, Coupon: "NOPE", Customer: Customer{Region: "XX"}}, ErrUnknownCoupon)
}

func TestHiddenCouponAndRegionAreCaseSensitive(t *testing.T) {
	expectErr(t, Order{Items: []Item{usToy(9000, 1, 0)}, Coupon: "save10", Customer: Customer{Region: "US"}}, ErrUnknownCoupon)
	expectErr(t, Order{Items: []Item{usToy(100, 1, 0)}, Customer: Customer{Region: "eu"}}, ErrUnknownRegion)
}

func TestHiddenMemberFivePercentOnExpensiveNonBook(t *testing.T) {
	expectQuote(t, Order{
		Items:    []Item{{SKU: "E", Category: "electronics", UnitPrice: 10000, Qty: 1}},
		Customer: Customer{Member: true, Region: "US"},
	}, QuoteResult{Subtotal: 10000, Discount: 500, Shipping: 700, Tax: 0, Total: 10200})
}

func TestHiddenMemberNoDiscountBelowPriceThreshold(t *testing.T) {
	expectQuote(t, Order{Items: []Item{usToy(9999, 1, 0)}, Customer: Customer{Member: true, Region: "US"}},
		QuoteResult{Subtotal: 9999, Discount: 0, Shipping: 700, Tax: 0, Total: 10699})
}

func TestHiddenNonMemberGetsNoMemberDiscount(t *testing.T) {
	expectQuote(t, Order{
		Items:    []Item{{SKU: "B", Category: "books", UnitPrice: 2000, Qty: 1}},
		Customer: Customer{Region: "US"},
	}, QuoteResult{Subtotal: 2000, Discount: 0, Shipping: 700, Tax: 0, Total: 2700})
}

func TestHiddenMemberCategoryIsCaseSensitive(t *testing.T) {
	expectQuote(t, Order{
		Items:    []Item{{SKU: "B", Category: "Books", UnitPrice: 2000, Qty: 1}},
		Customer: Customer{Member: true, Region: "US"},
	}, QuoteResult{Subtotal: 2000, Discount: 0, Shipping: 700, Tax: 0, Total: 2700})
}

func TestHiddenMemberDiscountRoundsDownPerLine(t *testing.T) {
	// 105*10/100 = 10 per line (20 total), not 210*10/100 = 21.
	expectQuote(t, Order{
		Items: []Item{
			{SKU: "B", Category: "books", UnitPrice: 105, Qty: 1},
			{SKU: "M", Category: "music", UnitPrice: 105, Qty: 1},
		},
		Customer: Customer{Member: true, Region: "US"},
	}, QuoteResult{Subtotal: 210, Discount: 20, Shipping: 700, Tax: 0, Total: 890})
}

func TestHiddenVolumeDiscountAtTenUnits(t *testing.T) {
	expectQuote(t, Order{Items: []Item{usToy(100, 10, 0)}, Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 1000, Discount: 30, Shipping: 700, Tax: 0, Total: 1670})
}

func TestHiddenNoVolumeDiscountAtNineUnits(t *testing.T) {
	expectQuote(t, Order{Items: []Item{usToy(100, 9, 0)}, Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 900, Discount: 0, Shipping: 700, Tax: 0, Total: 1600})
}

func TestHiddenVolumeCountsAcrossItemsAndRoundsDown(t *testing.T) {
	// qty 4+6 = 10; 1998*3/100 = 59.
	expectQuote(t, Order{Items: []Item{usToy(333, 4, 0), usToy(111, 6, 0)}, Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 1998, Discount: 59, Shipping: 700, Tax: 0, Total: 2639})
}

func TestHiddenVolumeAppliesAfterMemberDiscount(t *testing.T) {
	// 10000 -> member 9000 -> volume 9000-270 = 8730.
	expectQuote(t, Order{
		Items:    []Item{{SKU: "B", Category: "books", UnitPrice: 1000, Qty: 10}},
		Customer: Customer{Member: true, Region: "US"},
	}, QuoteResult{Subtotal: 10000, Discount: 1270, Shipping: 700, Tax: 0, Total: 9430})
}

func TestHiddenSave10Threshold(t *testing.T) {
	expectQuote(t, Order{Items: []Item{usToy(5000, 1, 0)}, Coupon: "SAVE10", Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 5000, Discount: 500, Shipping: 700, Tax: 0, Total: 5200})
	expectQuote(t, Order{Items: []Item{usToy(4999, 1, 0)}, Coupon: "SAVE10", Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 4999, Discount: 0, Shipping: 700, Tax: 0, Total: 5699})
}

func TestHiddenSave10ThresholdUsesAmountAfterMemberDiscount(t *testing.T) {
	// 5500 -> member 4950 < 5000, so SAVE10 does not apply.
	expectQuote(t, Order{
		Items:    []Item{{SKU: "B", Category: "books", UnitPrice: 5500, Qty: 1}},
		Coupon:   "SAVE10",
		Customer: Customer{Member: true, Region: "US"},
	}, QuoteResult{Subtotal: 5500, Discount: 550, Shipping: 700, Tax: 0, Total: 5650})
}

func TestHiddenFlat5Threshold(t *testing.T) {
	expectQuote(t, Order{Items: []Item{usToy(2000, 1, 0)}, Coupon: "FLAT5", Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 2000, Discount: 500, Shipping: 700, Tax: 0, Total: 2200})
	expectQuote(t, Order{Items: []Item{usToy(1999, 1, 0)}, Coupon: "FLAT5", Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 1999, Discount: 0, Shipping: 700, Tax: 0, Total: 2699})
}

func TestHiddenSpringOnFirstDay(t *testing.T) {
	expectQuote(t, Order{Items: []Item{usToy(1000, 1, 0)}, Coupon: "SPRING", Today: "2026-03-01", Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 1000, Discount: 150, Shipping: 700, Tax: 0, Total: 1550})
}

func TestHiddenSpringOnLastDayRoundsDown(t *testing.T) {
	// 999*15/100 = 149.
	expectQuote(t, Order{Items: []Item{usToy(999, 1, 0)}, Coupon: "SPRING", Today: "2026-05-31", Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 999, Discount: 149, Shipping: 700, Tax: 0, Total: 1550})
}

func TestHiddenSpringOutsideWindowIsIgnored(t *testing.T) {
	for _, today := range []string{"2026-02-28", "2026-06-01", "2025-04-15", ""} {
		expectQuote(t, Order{Items: []Item{usToy(1000, 1, 0)}, Coupon: "SPRING", Today: today, Customer: Customer{Region: "US"}},
			QuoteResult{Subtotal: 1000, Discount: 0, Shipping: 700, Tax: 0, Total: 1700})
	}
}

func TestHiddenShippingExactlyOneKgIsBase(t *testing.T) {
	expectQuote(t, Order{Items: []Item{usToy(100, 4, 250)}, Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 400, Discount: 0, Shipping: 700, Tax: 0, Total: 1100})
}

func TestHiddenShippingStartedKilogramSteps(t *testing.T) {
	cases := []struct{ weight, shipping int }{{1001, 1000}, {2000, 1000}, {2001, 1300}}
	for _, c := range cases {
		expectQuote(t, Order{Items: []Item{usToy(100, 1, c.weight)}, Customer: Customer{Region: "US"}},
			QuoteResult{Subtotal: 100, Discount: 0, Shipping: c.shipping, Tax: 0, Total: 100 + c.shipping})
	}
}

func TestHiddenShippingWeightIsMultipliedByQty(t *testing.T) {
	// 700 g * 3 = 2100 g -> 2 extra steps.
	expectQuote(t, Order{Items: []Item{usToy(100, 3, 700)}, Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 300, Discount: 0, Shipping: 1300, Tax: 0, Total: 1600})
}

func TestHiddenUKShippingAndTaxIncludeShipping(t *testing.T) {
	// 3500 g -> 600 + 3*250 = 1350; tax (2350*20+50)/100 = 470.
	expectQuote(t, Order{Items: []Item{usToy(1000, 1, 3500)}, Customer: Customer{Region: "UK"}},
		QuoteResult{Subtotal: 1000, Discount: 0, Shipping: 1350, Tax: 470, Total: 2820})
}

func TestHiddenMemberFreeShippingAtThreshold(t *testing.T) {
	expectQuote(t, Order{Items: []Item{usToy(5000, 2, 2500)}, Customer: Customer{Member: true, Region: "US"}},
		QuoteResult{Subtotal: 10000, Discount: 0, Shipping: 0, Tax: 0, Total: 10000})
}

func TestHiddenNonMemberFreeShippingThresholds(t *testing.T) {
	expectQuote(t, Order{Items: []Item{usToy(5000, 3, 300)}, Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 15000, Discount: 0, Shipping: 0, Tax: 0, Total: 15000})
	expectQuote(t, Order{Items: []Item{usToy(14999, 1, 1000)}, Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 14999, Discount: 0, Shipping: 700, Tax: 0, Total: 15699})
}

func TestHiddenFreeShippingUsesDiscountedAmount(t *testing.T) {
	// 16000 -> SAVE10 14400 < 15000, so shipping is charged.
	expectQuote(t, Order{Items: []Item{usToy(16000, 1, 0)}, Coupon: "SAVE10", Customer: Customer{Region: "US"}},
		QuoteResult{Subtotal: 16000, Discount: 1600, Shipping: 700, Tax: 0, Total: 15100})
}

func TestHiddenTaxRoundsHalfUpAndDown(t *testing.T) {
	// x = 550 -> 115.5 -> 116.
	expectQuote(t, Order{Items: []Item{usToy(50, 1, 0)}, Customer: Customer{Region: "EU"}},
		QuoteResult{Subtotal: 50, Discount: 0, Shipping: 500, Tax: 116, Total: 666})
	// x = 501 -> 105.21 -> 105.
	expectQuote(t, Order{Items: []Item{usToy(1, 1, 0)}, Customer: Customer{Region: "EU"}},
		QuoteResult{Subtotal: 1, Discount: 0, Shipping: 500, Tax: 105, Total: 606})
}

func TestHiddenFullOrderAllRulesCombined(t *testing.T) {
	// subtotal 6000+15000+1200 = 22200; member 600+750 -> 20850; volume (qty 10) -625 -> 20225;
	// FLAT5 -> 19725; member >= 10000 -> free shipping; tax (19725*21+50)/100 = 4142.
	expectQuote(t, Order{
		Items: []Item{
			{SKU: "B", Category: "books", UnitPrice: 1200, Qty: 5, WeightGrams: 200},
			{SKU: "E", Category: "electronics", UnitPrice: 15000, Qty: 1, WeightGrams: 2500},
			{SKU: "C", Category: "cables", UnitPrice: 300, Qty: 4, WeightGrams: 50},
			{SKU: "Z", Category: "books", UnitPrice: 99999, Qty: 0, WeightGrams: 99999},
		},
		Coupon:   "FLAT5",
		Customer: Customer{Member: true, Region: "EU"},
	}, QuoteResult{Subtotal: 22200, Discount: 2475, Shipping: 0, Tax: 4142, Total: 23867})
}
