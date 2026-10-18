package logstats

import (
	"reflect"
	"testing"
)

func TestAnalyzeCountsStatusClasses(t *testing.T) {
	lines := []string{
		"2024-05-01T10:00:00Z GET /home 200 12ms",
		"2024-05-01T10:00:01Z POST /login 302 30ms",
		"2024-05-01T10:00:02Z GET /missing 404 5ms",
	}
	got := Analyze(lines)
	if got.Total != 3 {
		t.Fatalf("Total = %d, want 3", got.Total)
	}
	want := map[string]int{"2xx": 1, "3xx": 1, "4xx": 1}
	if !reflect.DeepEqual(got.ByClass, want) {
		t.Fatalf("ByClass = %v, want %v", got.ByClass, want)
	}
}

func TestAnalyzeRecordsMalformedLineNumbers(t *testing.T) {
	lines := []string{
		"2024-05-01T10:00:00Z GET /home 200 12ms",
		"",
		"# comment",
		"not a log line",
		"2024-05-01T10:00:01Z FETCH /home 200 12ms",
	}
	got := Analyze(lines)
	if got.Total != 1 {
		t.Fatalf("Total = %d, want 1", got.Total)
	}
	want := []int{4, 5}
	if !reflect.DeepEqual(got.Malformed, want) {
		t.Fatalf("Malformed = %v, want %v", got.Malformed, want)
	}
}

func TestAnalyzeTopPathsAndUserAgents(t *testing.T) {
	lines := []string{
		`2024-05-01T10:00:00Z GET /a?x=1 200 10ms "curl/8.0"`,
		`2024-05-01T10:00:01Z GET /b 200 20ms "Mozilla/5.0 (X11; Linux)"`,
		`2024-05-01T10:00:02Z GET /a 200 30ms "curl/8.0"`,
	}
	got := Analyze(lines)
	want := []PathCount{{Path: "/a", Count: 2}, {Path: "/b", Count: 1}}
	if !reflect.DeepEqual(got.TopPaths, want) {
		t.Fatalf("TopPaths = %v, want %v", got.TopPaths, want)
	}
	if got.UniqueAgents != 2 {
		t.Fatalf("UniqueAgents = %d, want 2", got.UniqueAgents)
	}
	if got.FirstSeen != "2024-05-01T10:00:00Z" || got.LastSeen != "2024-05-01T10:00:02Z" {
		t.Fatalf("FirstSeen, LastSeen = %q, %q", got.FirstSeen, got.LastSeen)
	}
}

func TestAnalyzeByMethod(t *testing.T) {
	lines := []string{
		"2024-05-01T10:00:00Z GET /a 200 1ms",
		"2024-05-01T10:00:01Z POST /a 200 1ms",
		"2024-05-01T10:00:02Z GET /b 200 1ms",
		"2024-05-01T10:00:03Z FETCH /b 200 1ms",
	}
	got := Analyze(lines)
	want := map[string]int{"GET": 2, "POST": 1}
	if !reflect.DeepEqual(got.ByMethod, want) {
		t.Fatalf("ByMethod = %v, want %v", got.ByMethod, want)
	}
	if !reflect.DeepEqual(got, AnalyzeFiltered(lines, Filter{})) {
		t.Fatalf("Analyze differs from AnalyzeFiltered with empty filter")
	}
	if empty := Analyze(nil); empty.ByMethod == nil || len(empty.ByMethod) != 0 {
		t.Fatalf("ByMethod for no lines = %#v, want empty non-nil map", empty.ByMethod)
	}
}

func TestAnalyzeFilteredMethodsAndTimeRange(t *testing.T) {
	lines := []string{
		"2024-05-01T09:59:59Z GET /early 200 1ms",
		"2024-05-01T12:00:00+02:00 GET /from 200 2ms",
		"garbage",
		"2024-05-01T10:30:00Z POST /mid 500 3ms",
		"2024-05-01T10:45:00Z get /lower 200 4ms",
		"2024-05-01T11:00:00Z DELETE /to 404 5ms",
		"2024-05-01T11:00:01Z GET /late 200 6ms",
	}
	got := AnalyzeFiltered(lines, Filter{
		Methods: []string{"GET", "POST"},
		From:    "2024-05-01T10:00:00Z",
		To:      "2024-05-01T13:00:00+02:00",
	})
	if got.Total != 2 {
		t.Fatalf("Total = %d, want 2", got.Total)
	}
	if want := map[string]int{"GET": 1, "POST": 1}; !reflect.DeepEqual(got.ByMethod, want) {
		t.Fatalf("ByMethod = %v, want %v", got.ByMethod, want)
	}
	if want := []int{3, 5}; !reflect.DeepEqual(got.Malformed, want) {
		t.Fatalf("Malformed = %v, want %v", got.Malformed, want)
	}
	if got.FirstSeen != "2024-05-01T12:00:00+02:00" || got.LastSeen != "2024-05-01T10:30:00Z" {
		t.Fatalf("FirstSeen, LastSeen = %q, %q", got.FirstSeen, got.LastSeen)
	}
	if got.P95LatencyMs != 3 {
		t.Fatalf("P95LatencyMs = %d, want 3", got.P95LatencyMs)
	}

	none := AnalyzeFiltered(lines, Filter{Methods: []string{"PUT"}})
	if none.Total != 0 || none.ByMethod == nil || len(none.ByMethod) != 0 {
		t.Fatalf("PUT filter: Total = %d, ByMethod = %#v", none.Total, none.ByMethod)
	}
}
