// Package logstats computes summary statistics over access-log lines.
package logstats

import (
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
)

// PathCount is a request path (query string removed) and the number of
// parsed lines that requested it.
type PathCount struct {
	Path  string
	Count int
}

// Stats summarises a slice of access-log lines.
type Stats struct {
	Total        int
	ByClass      map[string]int
	TopPaths     []PathCount
	P95LatencyMs int
	Malformed    []int
	FirstSeen    string
	LastSeen     string
	UniqueAgents int
	ByMethod     map[string]int
}

// Filter restricts which parsed lines AnalyzeFiltered counts.
type Filter struct {
	Methods []string // methods to keep; empty or nil = all methods
	From    string   // RFC3339 timestamp, inclusive lower bound; "" = no lower bound
	To      string   // RFC3339 timestamp, inclusive upper bound; "" = no upper bound
}

// entry is a well-formed log line.
type entry struct {
	tsText   string
	ts       time.Time
	method   string
	path     string
	status   string
	latency  int
	agent    string
	hasAgent bool
}

var methods = map[string]bool{
	"GET": true, "POST": true, "PUT": true, "PATCH": true, "DELETE": true,
}

// Analyze parses the given access-log lines and returns their statistics.
func Analyze(lines []string) Stats {
	return AnalyzeFiltered(lines, Filter{})
}

// AnalyzeFiltered is like Analyze, but only parsed lines that pass f are
// counted. Malformed still lists every malformed line of the input.
func AnalyzeFiltered(lines []string, f Filter) Stats {
	st := Stats{
		ByClass:   map[string]int{},
		TopPaths:  []PathCount{},
		Malformed: []int{},
		ByMethod:  map[string]int{},
	}
	keep := newMatcher(f)
	var entries []entry
	for i, line := range lines {
		if strings.TrimSpace(line) == "" || line[0] == '#' {
			continue
		}
		e, ok := parseLine(line)
		if !ok {
			st.Malformed = append(st.Malformed, i+1)
			continue
		}
		if !keep(e) {
			continue
		}
		entries = append(entries, e)
	}
	st.Total = len(entries)
	if len(entries) == 0 {
		return st
	}
	pathCounts := map[string]int{}
	agents := map[string]bool{}
	latencies := make([]int, 0, len(entries))
	first, last := entries[0], entries[0]
	for _, e := range entries {
		st.ByClass[e.status[:1]+"xx"]++
		st.ByMethod[e.method]++
		pathCounts[e.path]++
		latencies = append(latencies, e.latency)
		if e.hasAgent {
			agents[e.agent] = true
		}
		if e.ts.Before(first.ts) {
			first = e
		}
		if e.ts.After(last.ts) {
			last = e
		}
	}
	st.TopPaths = topPaths(pathCounts, 3)
	st.P95LatencyMs = p95(latencies)
	st.FirstSeen, st.LastSeen = first.tsText, last.tsText
	st.UniqueAgents = len(agents)
	return st
}

// newMatcher returns a predicate reporting whether an entry passes f.
// f.From and f.To are assumed to be "" or valid RFC3339 timestamps.
func newMatcher(f Filter) func(entry) bool {
	var want map[string]bool
	if len(f.Methods) > 0 {
		want = make(map[string]bool, len(f.Methods))
		for _, m := range f.Methods {
			want[m] = true
		}
	}
	var from, to time.Time
	var hasFrom, hasTo bool
	if f.From != "" {
		from, hasFrom = parseTimestamp(f.From)
	}
	if f.To != "" {
		to, hasTo = parseTimestamp(f.To)
	}
	return func(e entry) bool {
		if want != nil && !want[e.method] {
			return false
		}
		if hasFrom && e.ts.Before(from) {
			return false
		}
		if hasTo && e.ts.After(to) {
			return false
		}
		return true
	}
}

func topPaths(counts map[string]int, n int) []PathCount {
	out := make([]PathCount, 0, len(counts))
	for p, c := range counts {
		out = append(out, PathCount{Path: p, Count: c})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Path < out[j].Path
	})
	if len(out) > n {
		out = out[:n]
	}
	return out
}

// p95 returns the nearest-rank 95th percentile of a non-empty slice.
func p95(vals []int) int {
	sort.Ints(vals)
	rank := (95*len(vals) + 99) / 100 // ceil(0.95 * N) in integer arithmetic
	return vals[rank-1]
}

func parseLine(line string) (entry, bool) {
	parts := strings.SplitN(line, " ", 6)
	if len(parts) < 5 {
		return entry{}, false
	}
	var e entry
	var ok bool
	if e.ts, ok = parseTimestamp(parts[0]); !ok {
		return entry{}, false
	}
	e.tsText = parts[0]
	if !methods[parts[1]] {
		return entry{}, false
	}
	e.method = parts[1]
	if e.path, ok = parsePath(parts[2]); !ok {
		return entry{}, false
	}
	if e.status, ok = parseStatus(parts[3]); !ok {
		return entry{}, false
	}
	if e.latency, ok = parseLatency(parts[4]); !ok {
		return entry{}, false
	}
	if len(parts) == 6 {
		if e.agent, ok = parseAgent(parts[5]); !ok {
			return entry{}, false
		}
		e.hasAgent = true
	}
	return e, true
}

func parseTimestamp(s string) (time.Time, bool) {
	t, err := time.Parse(time.RFC3339, s)
	return t, err == nil
}

func parsePath(s string) (string, bool) {
	if !strings.HasPrefix(s, "/") || strings.IndexFunc(s, unicode.IsSpace) >= 0 {
		return "", false
	}
	if i := strings.IndexByte(s, '?'); i >= 0 {
		s = s[:i]
	}
	return s, true
}

func parseStatus(s string) (string, bool) {
	if len(s) != 3 || !allDigits(s) || s < "100" || s > "599" {
		return "", false
	}
	return s, true
}

func parseLatency(s string) (int, bool) {
	num, found := strings.CutSuffix(s, "ms")
	if !found || num == "" || !allDigits(num) {
		return 0, false
	}
	n, err := strconv.Atoi(num)
	return n, err == nil
}

// parseAgent decodes a quoted user agent that must span the whole of s.
func parseAgent(s string) (string, bool) {
	if len(s) < 2 || s[0] != '"' || s[len(s)-1] != '"' {
		return "", false
	}
	inner := s[1 : len(s)-1]
	var b strings.Builder
	for i := 0; i < len(inner); i++ {
		c := inner[i]
		switch c {
		case '"':
			return "", false
		case '\\':
			if i+1 >= len(inner) || (inner[i+1] != '"' && inner[i+1] != '\\') {
				return "", false
			}
			i++
			c = inner[i]
		}
		b.WriteByte(c)
	}
	return b.String(), true
}

func allDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}
