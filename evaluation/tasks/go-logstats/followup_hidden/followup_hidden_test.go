package logstats

import (
	"reflect"
	"testing"
)

var followupLog = []string{
	"# sample",
	`2024-05-01T10:00:00Z GET /a?x=1 200 10ms "ua-1"`,
	`2024-05-01T10:01:00Z POST /b 201 20ms "ua-2"`,
	`2024-05-01T10:02:00Z GET /a 404 30ms "ua-1"`,
	"bad line",
	`2024-05-01T10:03:00Z DELETE /c 500 40ms`,
	`2024-05-01T10:04:00Z PUT /b 200 50ms "ua-3"`,
	"",
	`2024-05-01T10:05:00Z PATCH /a 302 60ms "ua-2"`,
	`2024-05-01T10:06:00Z FETCH /a 200 70ms`,
}

func TestFollowupAnalyzeFillsByMethod(t *testing.T) {
	got := Analyze(followupLog)
	want := map[string]int{"GET": 2, "POST": 1, "DELETE": 1, "PUT": 1, "PATCH": 1}
	if !reflect.DeepEqual(got.ByMethod, want) {
		t.Fatalf("ByMethod = %v, want %v", got.ByMethod, want)
	}
}

func TestFollowupByMethodEmptyNonNil(t *testing.T) {
	got := Analyze([]string{"", "# only comments"})
	if got.ByMethod == nil || len(got.ByMethod) != 0 {
		t.Fatalf("ByMethod = %#v, want empty non-nil map", got.ByMethod)
	}
	got = AnalyzeFiltered(followupLog, Filter{Methods: []string{"HEAD"}})
	if got.ByMethod == nil || len(got.ByMethod) != 0 {
		t.Fatalf("ByMethod = %#v, want empty non-nil map", got.ByMethod)
	}
}

func TestFollowupEmptyFilterEqualsAnalyze(t *testing.T) {
	a := Analyze(followupLog)
	b := AnalyzeFiltered(followupLog, Filter{})
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("Analyze = %+v\nAnalyzeFiltered(empty) = %+v", a, b)
	}
	c := AnalyzeFiltered(followupLog, Filter{Methods: []string{}})
	if !reflect.DeepEqual(a, c) {
		t.Fatalf("Analyze = %+v\nAnalyzeFiltered(empty methods) = %+v", a, c)
	}
}

func TestFollowupFilterByOneMethod(t *testing.T) {
	got := AnalyzeFiltered(followupLog, Filter{Methods: []string{"GET"}})
	if got.Total != 2 {
		t.Fatalf("Total = %d, want 2", got.Total)
	}
	if !reflect.DeepEqual(got.ByClass, map[string]int{"2xx": 1, "4xx": 1}) {
		t.Fatalf("ByClass = %v", got.ByClass)
	}
	if !reflect.DeepEqual(got.TopPaths, []PathCount{{"/a", 2}}) {
		t.Fatalf("TopPaths = %v", got.TopPaths)
	}
	if got.P95LatencyMs != 30 || got.UniqueAgents != 1 {
		t.Fatalf("P95, UniqueAgents = %d, %d; want 30, 1", got.P95LatencyMs, got.UniqueAgents)
	}
	if got.FirstSeen != "2024-05-01T10:00:00Z" || got.LastSeen != "2024-05-01T10:02:00Z" {
		t.Fatalf("FirstSeen, LastSeen = %q, %q", got.FirstSeen, got.LastSeen)
	}
	if !reflect.DeepEqual(got.ByMethod, map[string]int{"GET": 2}) {
		t.Fatalf("ByMethod = %v", got.ByMethod)
	}
}

func TestFollowupFilterBySeveralMethods(t *testing.T) {
	got := AnalyzeFiltered(followupLog, Filter{Methods: []string{"POST", "PUT"}})
	if got.Total != 2 {
		t.Fatalf("Total = %d, want 2", got.Total)
	}
	if !reflect.DeepEqual(got.ByMethod, map[string]int{"POST": 1, "PUT": 1}) {
		t.Fatalf("ByMethod = %v", got.ByMethod)
	}
	if !reflect.DeepEqual(got.TopPaths, []PathCount{{"/b", 2}}) {
		t.Fatalf("TopPaths = %v", got.TopPaths)
	}
}

func TestFollowupMethodFilterIsCaseSensitive(t *testing.T) {
	got := AnalyzeFiltered(followupLog, Filter{Methods: []string{"get"}})
	if got.Total != 0 || len(got.TopPaths) != 0 || got.P95LatencyMs != 0 || got.FirstSeen != "" {
		t.Fatalf("got %+v, want nothing counted", got)
	}
}

func TestFollowupMalformedReportedRegardlessOfFilter(t *testing.T) {
	got := AnalyzeFiltered(followupLog, Filter{Methods: []string{"DELETE"}, From: "2030-01-01T00:00:00Z"})
	if got.Total != 0 {
		t.Fatalf("Total = %d, want 0", got.Total)
	}
	if !reflect.DeepEqual(got.Malformed, []int{5, 10}) {
		t.Fatalf("Malformed = %v, want [5 10]", got.Malformed)
	}
}

func TestFollowupTimeWindowIsInclusive(t *testing.T) {
	got := AnalyzeFiltered(followupLog, Filter{From: "2024-05-01T10:01:00Z", To: "2024-05-01T10:03:00Z"})
	if got.Total != 3 {
		t.Fatalf("Total = %d, want 3", got.Total)
	}
	if got.FirstSeen != "2024-05-01T10:01:00Z" || got.LastSeen != "2024-05-01T10:03:00Z" {
		t.Fatalf("FirstSeen, LastSeen = %q, %q", got.FirstSeen, got.LastSeen)
	}
	if !reflect.DeepEqual(got.ByMethod, map[string]int{"POST": 1, "GET": 1, "DELETE": 1}) {
		t.Fatalf("ByMethod = %v", got.ByMethod)
	}
	if got.P95LatencyMs != 40 {
		t.Fatalf("P95 = %d, want 40", got.P95LatencyMs)
	}
}

func TestFollowupOpenLowerBound(t *testing.T) {
	got := AnalyzeFiltered(followupLog, Filter{To: "2024-05-01T10:01:30Z"})
	if got.Total != 2 || got.LastSeen != "2024-05-01T10:01:00Z" {
		t.Fatalf("Total, LastSeen = %d, %q; want 2, 2024-05-01T10:01:00Z", got.Total, got.LastSeen)
	}
}

func TestFollowupOpenUpperBound(t *testing.T) {
	got := AnalyzeFiltered(followupLog, Filter{From: "2024-05-01T10:04:00Z"})
	if got.Total != 2 || got.FirstSeen != "2024-05-01T10:04:00Z" || got.LastSeen != "2024-05-01T10:05:00Z" {
		t.Fatalf("Total, FirstSeen, LastSeen = %d, %q, %q", got.Total, got.FirstSeen, got.LastSeen)
	}
	if got.UniqueAgents != 2 {
		t.Fatalf("UniqueAgents = %d, want 2", got.UniqueAgents)
	}
}

func TestFollowupTimeWindowComparesInstantsAcrossZones(t *testing.T) {
	lines := []string{
		"2024-05-01T12:00:00+02:00 GET /a 200 1ms",
		"2024-05-01T10:30:00Z GET /b 200 2ms",
		"2024-05-01T07:59:59-02:00 GET /c 200 3ms",
	}
	got := AnalyzeFiltered(lines, Filter{From: "2024-05-01T10:00:00Z", To: "2024-05-01T12:59:59+02:00"})
	if got.Total != 2 {
		t.Fatalf("Total = %d, want 2", got.Total)
	}
	want := []PathCount{{"/a", 1}, {"/b", 1}}
	if !reflect.DeepEqual(got.TopPaths, want) {
		t.Fatalf("TopPaths = %v, want %v", got.TopPaths, want)
	}
}

func TestFollowupWindowWithNoMatchingLines(t *testing.T) {
	got := AnalyzeFiltered(followupLog, Filter{From: "2024-05-01T10:02:30Z", To: "2024-05-01T10:02:59Z"})
	if got.Total != 0 || got.FirstSeen != "" || got.LastSeen != "" || got.UniqueAgents != 0 {
		t.Fatalf("got %+v, want nothing counted", got)
	}
	if got.ByClass == nil || len(got.ByClass) != 0 || got.TopPaths == nil || len(got.TopPaths) != 0 {
		t.Fatalf("ByClass, TopPaths = %#v, %#v; want empty non-nil", got.ByClass, got.TopPaths)
	}
}

func TestFollowupMethodAndWindowCombined(t *testing.T) {
	got := AnalyzeFiltered(followupLog, Filter{Methods: []string{"GET", "PATCH"}, From: "2024-05-01T10:01:00Z"})
	if got.Total != 2 {
		t.Fatalf("Total = %d, want 2", got.Total)
	}
	if !reflect.DeepEqual(got.ByMethod, map[string]int{"GET": 1, "PATCH": 1}) {
		t.Fatalf("ByMethod = %v", got.ByMethod)
	}
	if !reflect.DeepEqual(got.ByClass, map[string]int{"3xx": 1, "4xx": 1}) {
		t.Fatalf("ByClass = %v", got.ByClass)
	}
	if !reflect.DeepEqual(got.TopPaths, []PathCount{{"/a", 2}}) {
		t.Fatalf("TopPaths = %v", got.TopPaths)
	}
}
