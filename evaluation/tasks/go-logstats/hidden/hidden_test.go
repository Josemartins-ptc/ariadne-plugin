package logstats

import (
	"fmt"
	"reflect"
	"testing"
)

func hiddenLine(sec int, method, path string, status, latency int) string {
	return fmt.Sprintf("2024-05-01T10:00:%02dZ %s %s %d %dms", sec, method, path, status, latency)
}

func hiddenExpectMalformed(t *testing.T, lines []string, want []int) {
	t.Helper()
	got := Analyze(lines)
	if !reflect.DeepEqual(got.Malformed, want) {
		t.Fatalf("Malformed = %v, want %v", got.Malformed, want)
	}
}

func TestHiddenEmptyInput(t *testing.T) {
	got := Analyze(nil)
	if got.Total != 0 || got.P95LatencyMs != 0 || got.UniqueAgents != 0 {
		t.Fatalf("Total, P95, UniqueAgents = %d, %d, %d; want zeros", got.Total, got.P95LatencyMs, got.UniqueAgents)
	}
	if got.FirstSeen != "" || got.LastSeen != "" {
		t.Fatalf("FirstSeen, LastSeen = %q, %q; want empty", got.FirstSeen, got.LastSeen)
	}
	if got.ByClass == nil || len(got.ByClass) != 0 {
		t.Fatalf("ByClass = %#v, want empty non-nil map", got.ByClass)
	}
	if got.TopPaths == nil || len(got.TopPaths) != 0 {
		t.Fatalf("TopPaths = %#v, want empty non-nil slice", got.TopPaths)
	}
	if got.Malformed == nil || len(got.Malformed) != 0 {
		t.Fatalf("Malformed = %#v, want empty non-nil slice", got.Malformed)
	}
}

func TestHiddenOnlySkippedLines(t *testing.T) {
	got := Analyze([]string{"", "   ", "\t", "# header", "#", "\r"})
	if got.Total != 0 || len(got.Malformed) != 0 || got.FirstSeen != "" {
		t.Fatalf("got Total=%d Malformed=%v FirstSeen=%q; want nothing counted", got.Total, got.Malformed, got.FirstSeen)
	}
}

func TestHiddenIndentedHashIsMalformed(t *testing.T) {
	hiddenExpectMalformed(t, []string{" # not a comment", hiddenLine(0, "GET", "/", 200, 1)}, []int{1})
}

func TestHiddenAllStatusClasses(t *testing.T) {
	lines := []string{
		hiddenLine(0, "GET", "/a", 100, 1),
		hiddenLine(1, "GET", "/a", 199, 1),
		hiddenLine(2, "GET", "/a", 200, 1),
		hiddenLine(3, "GET", "/a", 304, 1),
		hiddenLine(4, "GET", "/a", 418, 1),
		hiddenLine(5, "GET", "/a", 500, 1),
		hiddenLine(6, "GET", "/a", 599, 1),
	}
	got := Analyze(lines)
	want := map[string]int{"1xx": 2, "2xx": 1, "3xx": 1, "4xx": 1, "5xx": 2}
	if !reflect.DeepEqual(got.ByClass, want) {
		t.Fatalf("ByClass = %v, want %v", got.ByClass, want)
	}
	if got.Total != 7 {
		t.Fatalf("Total = %d, want 7", got.Total)
	}
}

func TestHiddenStatusOutOfRangeOrBadDigits(t *testing.T) {
	lines := []string{
		"2024-05-01T10:00:00Z GET /a 099 1ms",
		"2024-05-01T10:00:00Z GET /a 600 1ms",
		"2024-05-01T10:00:00Z GET /a 20 1ms",
		"2024-05-01T10:00:00Z GET /a 2000 1ms",
		"2024-05-01T10:00:00Z GET /a 2x0 1ms",
		"2024-05-01T10:00:00Z GET /a +20 1ms",
		"2024-05-01T10:00:00Z GET /a 200 1ms",
	}
	hiddenExpectMalformed(t, lines, []int{1, 2, 3, 4, 5, 6})
}

func TestHiddenMethodsAreExactAndCaseSensitive(t *testing.T) {
	lines := []string{
		"2024-05-01T10:00:00Z GET /a 200 1ms",
		"2024-05-01T10:00:00Z POST /a 200 1ms",
		"2024-05-01T10:00:00Z PUT /a 200 1ms",
		"2024-05-01T10:00:00Z PATCH /a 200 1ms",
		"2024-05-01T10:00:00Z DELETE /a 200 1ms",
		"2024-05-01T10:00:00Z get /a 200 1ms",
		"2024-05-01T10:00:00Z HEAD /a 200 1ms",
		"2024-05-01T10:00:00Z OPTIONS /a 200 1ms",
	}
	got := Analyze(lines)
	if got.Total != 5 {
		t.Fatalf("Total = %d, want 5", got.Total)
	}
	if !reflect.DeepEqual(got.Malformed, []int{6, 7, 8}) {
		t.Fatalf("Malformed = %v, want [6 7 8]", got.Malformed)
	}
}

func TestHiddenLatencyFormat(t *testing.T) {
	lines := []string{
		"2024-05-01T10:00:00Z GET /a 200 12",
		"2024-05-01T10:00:00Z GET /a 200 12s",
		"2024-05-01T10:00:00Z GET /a 200 -5ms",
		"2024-05-01T10:00:00Z GET /a 200 1.5ms",
		"2024-05-01T10:00:00Z GET /a 200 ms",
		"2024-05-01T10:00:00Z GET /a 200 12MS",
		"2024-05-01T10:00:00Z GET /a 200 0ms",
		"2024-05-01T10:00:00Z GET /a 200 007ms",
	}
	got := Analyze(lines)
	if !reflect.DeepEqual(got.Malformed, []int{1, 2, 3, 4, 5, 6}) {
		t.Fatalf("Malformed = %v, want [1 2 3 4 5 6]", got.Malformed)
	}
	if got.Total != 2 || got.P95LatencyMs != 7 {
		t.Fatalf("Total, P95 = %d, %d; want 2, 7", got.Total, got.P95LatencyMs)
	}
}

func TestHiddenLatencyTooLargeForIntIsMalformed(t *testing.T) {
	hiddenExpectMalformed(t, []string{"2024-05-01T10:00:00Z GET /a 200 99999999999999999999999ms"}, []int{1})
}

func TestHiddenBadTimestamps(t *testing.T) {
	lines := []string{
		"2024-05-01 GET /a 200 1ms",
		"2024-13-01T10:00:00Z GET /a 200 1ms",
		"2024-05-01T10:00:00 GET /a 200 1ms",
		"yesterday GET /a 200 1ms",
		"2024-05-01T10:00:00+02:00 GET /a 200 1ms",
		"2024-05-01T10:00:00.250Z GET /a 200 1ms",
	}
	got := Analyze(lines)
	if !reflect.DeepEqual(got.Malformed, []int{1, 2, 3, 4}) {
		t.Fatalf("Malformed = %v, want [1 2 3 4]", got.Malformed)
	}
	if got.Total != 2 {
		t.Fatalf("Total = %d, want 2", got.Total)
	}
}

func TestHiddenSeparatorsMustBeSingleSpaces(t *testing.T) {
	lines := []string{
		"2024-05-01T10:00:00Z  GET /a 200 1ms",
		" 2024-05-01T10:00:00Z GET /a 200 1ms",
		"2024-05-01T10:00:00Z GET /a 200 1ms ",
		"2024-05-01T10:00:00Z\tGET /a 200 1ms",
		"2024-05-01T10:00:00Z GET /a 200",
		"2024-05-01T10:00:00Z GET /a 200 1ms extra",
		"2024-05-01T10:00:00Z GET /a 200 1ms",
	}
	hiddenExpectMalformed(t, lines, []int{1, 2, 3, 4, 5, 6})
}

func TestHiddenPathMustStartWithSlash(t *testing.T) {
	lines := []string{
		"2024-05-01T10:00:00Z GET a 200 1ms",
		"2024-05-01T10:00:00Z GET ?q=1 200 1ms",
		"2024-05-01T10:00:00Z GET http://x/a 200 1ms",
		"2024-05-01T10:00:00Z GET / 200 1ms",
	}
	hiddenExpectMalformed(t, lines, []int{1, 2, 3})
}

func TestHiddenQueryStringDroppedForGrouping(t *testing.T) {
	lines := []string{
		hiddenLine(0, "GET", "/a?x=1", 200, 1),
		hiddenLine(1, "GET", "/a?y=2?z", 200, 1),
		hiddenLine(2, "GET", "/a", 200, 1),
		hiddenLine(3, "GET", "/?q", 200, 1),
		hiddenLine(4, "GET", "/a/", 200, 1),
	}
	got := Analyze(lines)
	want := []PathCount{{"/a", 3}, {"/", 1}, {"/a/", 1}}
	if !reflect.DeepEqual(got.TopPaths, want) {
		t.Fatalf("TopPaths = %v, want %v", got.TopPaths, want)
	}
}

func TestHiddenTopPathsLimitedToThreeWithTieBreak(t *testing.T) {
	lines := []string{
		hiddenLine(0, "GET", "/d", 200, 1),
		hiddenLine(1, "GET", "/c", 200, 1),
		hiddenLine(2, "GET", "/b", 200, 1),
		hiddenLine(3, "GET", "/a", 200, 1),
		hiddenLine(4, "GET", "/z", 200, 1),
		hiddenLine(5, "GET", "/z", 200, 1),
	}
	got := Analyze(lines)
	want := []PathCount{{"/z", 2}, {"/a", 1}, {"/b", 1}}
	if !reflect.DeepEqual(got.TopPaths, want) {
		t.Fatalf("TopPaths = %v, want %v", got.TopPaths, want)
	}
}

func TestHiddenTopPathsCountsAllMethodsAndStatuses(t *testing.T) {
	lines := []string{
		hiddenLine(0, "GET", "/x", 200, 1),
		hiddenLine(1, "DELETE", "/x", 500, 1),
		hiddenLine(2, "POST", "/y", 201, 1),
		"garbage",
	}
	got := Analyze(lines)
	want := []PathCount{{"/x", 2}, {"/y", 1}}
	if !reflect.DeepEqual(got.TopPaths, want) {
		t.Fatalf("TopPaths = %v, want %v", got.TopPaths, want)
	}
}

func TestHiddenP95SingleValue(t *testing.T) {
	got := Analyze([]string{hiddenLine(0, "GET", "/", 200, 42)})
	if got.P95LatencyMs != 42 {
		t.Fatalf("P95 = %d, want 42", got.P95LatencyMs)
	}
}

func TestHiddenP95NearestRankTwentyValues(t *testing.T) {
	var lines []string
	for i := 20; i >= 1; i-- {
		lines = append(lines, hiddenLine(i, "GET", "/", 200, i*10))
	}
	got := Analyze(lines)
	if got.P95LatencyMs != 190 {
		t.Fatalf("P95 = %d, want 190 (position 19 of 20)", got.P95LatencyMs)
	}
}

func TestHiddenP95NearestRankTwentyOneValues(t *testing.T) {
	var lines []string
	for i := 1; i <= 21; i++ {
		lines = append(lines, hiddenLine(i, "GET", "/", 200, i))
	}
	got := Analyze(lines)
	if got.P95LatencyMs != 20 {
		t.Fatalf("P95 = %d, want 20 (position 20 of 21)", got.P95LatencyMs)
	}
}

func TestHiddenP95SmallSetsAndDuplicates(t *testing.T) {
	lines := []string{
		hiddenLine(0, "GET", "/", 200, 5),
		hiddenLine(1, "GET", "/", 200, 300),
		hiddenLine(2, "GET", "/", 200, 5),
	}
	got := Analyze(lines)
	if got.P95LatencyMs != 300 {
		t.Fatalf("P95 = %d, want 300 (position 3 of 3)", got.P95LatencyMs)
	}
}

func TestHiddenP95IgnoresMalformedLines(t *testing.T) {
	lines := []string{
		hiddenLine(0, "GET", "/", 200, 10),
		"2024-05-01T10:00:00Z GET / 700 9999ms",
		hiddenLine(1, "GET", "/", 200, 20),
	}
	got := Analyze(lines)
	if got.P95LatencyMs != 20 {
		t.Fatalf("P95 = %d, want 20", got.P95LatencyMs)
	}
}

func TestHiddenFirstAndLastSeenCompareInstantsAcrossZones(t *testing.T) {
	lines := []string{
		"2024-05-01T11:00:00Z GET /a 200 1ms",
		"2024-05-01T12:00:00+02:00 GET /a 200 1ms",
		"2024-05-01T09:30:00-03:00 GET /a 200 1ms",
	}
	got := Analyze(lines)
	if got.FirstSeen != "2024-05-01T12:00:00+02:00" {
		t.Fatalf("FirstSeen = %q, want 2024-05-01T12:00:00+02:00", got.FirstSeen)
	}
	if got.LastSeen != "2024-05-01T09:30:00-03:00" {
		t.Fatalf("LastSeen = %q, want 2024-05-01T09:30:00-03:00", got.LastSeen)
	}
}

func TestHiddenFirstAndLastSeenTiesKeepFirstInInputOrder(t *testing.T) {
	lines := []string{
		"2024-05-01T10:00:00Z GET /a 200 1ms",
		"2024-05-01T12:00:00+02:00 GET /a 200 1ms",
		"2024-05-01T11:00:00Z GET /a 200 1ms",
		"2024-05-01T13:00:00+02:00 GET /a 200 1ms",
	}
	got := Analyze(lines)
	if got.FirstSeen != "2024-05-01T10:00:00Z" {
		t.Fatalf("FirstSeen = %q, want 2024-05-01T10:00:00Z", got.FirstSeen)
	}
	if got.LastSeen != "2024-05-01T11:00:00Z" {
		t.Fatalf("LastSeen = %q, want 2024-05-01T11:00:00Z", got.LastSeen)
	}
}

func TestHiddenFirstSeenKeepsOriginalText(t *testing.T) {
	got := Analyze([]string{"2024-05-01T10:00:00.250+00:00 GET /a 200 1ms"})
	if got.FirstSeen != "2024-05-01T10:00:00.250+00:00" || got.LastSeen != "2024-05-01T10:00:00.250+00:00" {
		t.Fatalf("FirstSeen, LastSeen = %q, %q", got.FirstSeen, got.LastSeen)
	}
}

func TestHiddenUserAgentWithEscapes(t *testing.T) {
	lines := []string{
		`2024-05-01T10:00:00Z GET /a 200 1ms "bot \"v2\""`,
		`2024-05-01T10:00:01Z GET /a 200 1ms "bot \"v2\""`,
		`2024-05-01T10:00:02Z GET /a 200 1ms "path\\to"`,
		`2024-05-01T10:00:03Z GET /a 200 1ms "a b  c"`,
	}
	got := Analyze(lines)
	if got.Total != 4 || len(got.Malformed) != 0 {
		t.Fatalf("Total=%d Malformed=%v; want 4 lines parsed", got.Total, got.Malformed)
	}
	if got.UniqueAgents != 3 {
		t.Fatalf("UniqueAgents = %d, want 3", got.UniqueAgents)
	}
}

func TestHiddenUserAgentsComparedAfterDecoding(t *testing.T) {
	lines := []string{
		`2024-05-01T10:00:00Z GET /a 200 1ms "x\\y"`,
		`2024-05-01T10:00:01Z GET /a 200 1ms "x\\\\y"`,
		`2024-05-01T10:00:02Z GET /a 200 1ms "q\"q"`,
		`2024-05-01T10:00:03Z GET /a 200 1ms "q\\\"q"`,
	}
	got := Analyze(lines)
	if got.UniqueAgents != 4 || got.Total != 4 {
		t.Fatalf("UniqueAgents=%d Total=%d; want 4, 4", got.UniqueAgents, got.Total)
	}
}

func TestHiddenEmptyAgentCountsAndMissingAgentDoesNot(t *testing.T) {
	lines := []string{
		`2024-05-01T10:00:00Z GET /a 200 1ms ""`,
		`2024-05-01T10:00:01Z GET /a 200 1ms`,
		`2024-05-01T10:00:02Z GET /a 200 1ms ""`,
		`2024-05-01T10:00:03Z GET /a 200 1ms "curl"`,
	}
	got := Analyze(lines)
	if got.UniqueAgents != 2 || got.Total != 4 {
		t.Fatalf("UniqueAgents=%d Total=%d; want 2, 4", got.UniqueAgents, got.Total)
	}
}

func TestHiddenBadUserAgentsAreMalformed(t *testing.T) {
	lines := []string{
		`2024-05-01T10:00:00Z GET /a 200 1ms curl`,
		`2024-05-01T10:00:00Z GET /a 200 1ms "unterminated`,
		`2024-05-01T10:00:00Z GET /a 200 1ms "a"b"`,
		`2024-05-01T10:00:00Z GET /a 200 1ms "a" `,
		`2024-05-01T10:00:00Z GET /a 200 1ms "a\"`,
		`2024-05-01T10:00:00Z GET /a 200 1ms "a\nb"`,
		`2024-05-01T10:00:00Z GET /a 200 1ms "`,
		`2024-05-01T10:00:00Z GET /a 200 1ms "ok" "extra"`,
		`2024-05-01T10:00:00Z GET /a 200 1ms  "a"`,
		`2024-05-01T10:00:00Z GET /a 200 1ms "fine"`,
	}
	got := Analyze(lines)
	if !reflect.DeepEqual(got.Malformed, []int{1, 2, 3, 4, 5, 6, 7, 8, 9}) {
		t.Fatalf("Malformed = %v, want [1..9]", got.Malformed)
	}
	if got.UniqueAgents != 1 {
		t.Fatalf("UniqueAgents = %d, want 1", got.UniqueAgents)
	}
}

func TestHiddenMalformedLineNumbersCountSkippedLines(t *testing.T) {
	lines := []string{
		"# header",
		"",
		"bad one",
		hiddenLine(0, "GET", "/", 200, 1),
		"   ",
		"bad two",
		"#",
		"2024-05-01T10:00:00Z GET / 200 1ms \"",
	}
	hiddenExpectMalformed(t, lines, []int{3, 6, 8})
}

func TestHiddenMixedRealisticLog(t *testing.T) {
	lines := []string{
		"# access log",
		`2024-05-01T10:00:05Z GET /api/items?page=2 200 40ms "Mozilla/5.0 (Macintosh)"`,
		`2024-05-01T10:00:01Z POST /api/items 201 120ms "curl/8.4.0"`,
		`2024-05-01T10:00:09Z GET /api/items 200 35ms "Mozilla/5.0 (Macintosh)"`,
		`2024-05-01T10:00:03Z DELETE /api/items/7 404 8ms`,
		"",
		`2024-05-01T10:00:07Z GET /health 503 2ms "kube-probe/1.29"`,
		`2024-05-01T10:00:08Z GET /health 200 1ms "kube-probe/1.29"`,
		`2024-05-01T10:00:02Z PUT /api/items/7 500 900ms "curl/8.4.0"`,
		`2024-05-01 10:00:04 GET /api/items 200 30ms`,
	}
	got := Analyze(lines)
	if got.Total != 7 {
		t.Fatalf("Total = %d, want 7", got.Total)
	}
	wantClass := map[string]int{"2xx": 4, "4xx": 1, "5xx": 2}
	if !reflect.DeepEqual(got.ByClass, wantClass) {
		t.Fatalf("ByClass = %v, want %v", got.ByClass, wantClass)
	}
	wantTop := []PathCount{{"/api/items", 3}, {"/api/items/7", 2}, {"/health", 2}}
	if !reflect.DeepEqual(got.TopPaths, wantTop) {
		t.Fatalf("TopPaths = %v, want %v", got.TopPaths, wantTop)
	}
	if got.P95LatencyMs != 900 {
		t.Fatalf("P95 = %d, want 900", got.P95LatencyMs)
	}
	if !reflect.DeepEqual(got.Malformed, []int{10}) {
		t.Fatalf("Malformed = %v, want [10]", got.Malformed)
	}
	if got.FirstSeen != "2024-05-01T10:00:01Z" || got.LastSeen != "2024-05-01T10:00:09Z" {
		t.Fatalf("FirstSeen, LastSeen = %q, %q", got.FirstSeen, got.LastSeen)
	}
	if got.UniqueAgents != 3 {
		t.Fatalf("UniqueAgents = %d, want 3", got.UniqueAgents)
	}
}
