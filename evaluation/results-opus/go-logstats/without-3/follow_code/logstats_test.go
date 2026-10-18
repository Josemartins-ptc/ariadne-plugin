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

func TestAnalyzeFilteredMethodsAndTimeRange(t *testing.T) {
	lines := []string{
		"2024-05-01T09:59:59Z GET /early 200 1ms",
		"2024-05-01T12:00:00+02:00 GET /a 200 10ms",
		"bad line",
		"2024-05-01T10:30:00Z POST /b 201 20ms",
		"2024-05-01T11:00:00Z get /c 200 30ms",
		"2024-05-01T11:00:00Z DELETE /d 204 40ms",
		"2024-05-01T11:00:01Z GET /late 200 50ms",
	}
	f := Filter{Methods: []string{"GET", "DELETE"}, From: "2024-05-01T10:00:00Z", To: "2024-05-01T13:00:00+02:00"}
	got := AnalyzeFiltered(lines, f)
	if got.Total != 2 {
		t.Fatalf("Total = %d, want 2", got.Total)
	}
	if want := map[string]int{"GET": 1, "DELETE": 1}; !reflect.DeepEqual(got.ByMethod, want) {
		t.Fatalf("ByMethod = %v, want %v", got.ByMethod, want)
	}
	if want := []int{3, 5}; !reflect.DeepEqual(got.Malformed, want) {
		t.Fatalf("Malformed = %v, want %v", got.Malformed, want)
	}
	if got.FirstSeen != "2024-05-01T12:00:00+02:00" || got.LastSeen != "2024-05-01T11:00:00Z" {
		t.Fatalf("FirstSeen, LastSeen = %q, %q", got.FirstSeen, got.LastSeen)
	}

	none := AnalyzeFiltered(lines, Filter{Methods: []string{"PUT"}})
	if none.Total != 0 || none.ByMethod == nil || len(none.ByMethod) != 0 {
		t.Fatalf("empty filter result: %+v", none)
	}
	if !reflect.DeepEqual(Analyze(lines), AnalyzeFiltered(lines, Filter{})) {
		t.Fatal("Analyze differs from AnalyzeFiltered with empty filter")
	}
}
