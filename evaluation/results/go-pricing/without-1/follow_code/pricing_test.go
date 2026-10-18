package pricing

import "testing"

func TestSingleItemNonMemberEU(t *testing.T) {
	got, err := Quote(Order{
		Items:    []Item{{SKU: "A1", Category: "toys", UnitPrice: 1000, Qty: 2, WeightGrams: 300}},
		Customer: Customer{Member: false, Region: "EU"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := QuoteResult{Subtotal: 2000, Discount: 0, Shipping: 500, Tax: 525, Total: 3025}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestMemberBookDiscountUS(t *testing.T) {
	got, err := Quote(Order{
		Items:    []Item{{SKU: "B1", Category: "books", UnitPrice: 1500, Qty: 1, WeightGrams: 400}},
		Customer: Customer{Member: true, Region: "US"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := QuoteResult{Subtotal: 1500, Discount: 150, Shipping: 700, Tax: 0, Total: 2050}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestUnknownRegionIsAnError(t *testing.T) {
	_, err := Quote(Order{
		Items:    []Item{{SKU: "A1", Category: "toys", UnitPrice: 1000, Qty: 1, WeightGrams: 100}},
		Customer: Customer{Region: "MARS"},
	})
	if err != ErrUnknownRegion {
		t.Fatalf("got error %v, want ErrUnknownRegion", err)
	}
}
