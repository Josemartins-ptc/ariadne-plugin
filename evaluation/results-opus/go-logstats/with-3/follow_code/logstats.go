// Package logstats computes summary statistics over access-log lines.
package logstats

import (
	"slices"
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

// Filter restricts which parsed lines are counted by AnalyzeFiltered.
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
	class    string
	latency  int
	agent    string
	hasAgent bool
}

var methods = map[string]bool{"GET": true, "POST": true, "PUT": true, "PATCH": true, "DELETE": true}

// Analyze parses the given access-log lines and returns their statistics.
func Analyze(lines []string) Stats {
	return AnalyzeFiltered(lines, Filter{})
}

// AnalyzeFiltered is like Analyze but counts only the parsed lines that pass
// f. Malformed still lists every malformed line of the input.
func AnalyzeFiltered(lines []string, f Filter) Stats {
	st := Stats{ByClass: map[string]int{}, TopPaths: []PathCount{}, Malformed: []int{}, ByMethod: map[string]int{}}
	keep := f.matcher()
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
		if keep(e) {
			entries = append(entries, e)
		}
	}
	st.Total = len(entries)
	if st.Total == 0 {
		return st
	}
	for _, e := range entries {
		st.ByClass[e.class]++
		st.ByMethod[e.method]++
	}
	st.TopPaths = topPaths(entries, 3)
	st.P95LatencyMs = p95(entries)
	st.FirstSeen, st.LastSeen = timeRange(entries)
	st.UniqueAgents = uniqueAgents(entries)
	return st
}

// matcher returns a predicate reporting whether an entry passes f.
// From and To are assumed to be "" or valid RFC3339 timestamps.
func (f Filter) matcher() func(entry) bool {
	var from, to time.Time
	if f.From != "" {
		from, _ = time.Parse(time.RFC3339, f.From)
	}
	if f.To != "" {
		to, _ = time.Parse(time.RFC3339, f.To)
	}
	return func(e entry) bool {
		if len(f.Methods) > 0 && !slices.Contains(f.Methods, e.method) {
			return false
		}
		if f.From != "" && e.ts.Before(from) {
			return false
		}
		if f.To != "" && e.ts.After(to) {
			return false
		}
		return true
	}
}

// parseLine parses one non-skipped line, reporting whether it is well-formed.
func parseLine(line string) (entry, bool) {
	parts := strings.SplitN(line, " ", 6)
	if len(parts) < 5 {
		return entry{}, false
	}
	ts, err := time.Parse(time.RFC3339, parts[0])
	if err != nil || !methods[parts[1]] {
		return entry{}, false
	}
	e := entry{tsText: parts[0], ts: ts, method: parts[1]}
	var okPath, okStatus, okLatency bool
	e.path, okPath = parsePath(parts[2])
	e.class, okStatus = parseStatus(parts[3])
	e.latency, okLatency = parseLatency(parts[4])
	if !okPath || !okStatus || !okLatency {
		return entry{}, false
	}
	if len(parts) == 6 {
		var ok bool
		if e.agent, ok = parseAgent(parts[5]); !ok {
			return entry{}, false
		}
		e.hasAgent = true
	}
	return e, true
}

// parsePath validates a path token and drops its query string.
func parsePath(s string) (string, bool) {
	if !strings.HasPrefix(s, "/") || strings.IndexFunc(s, unicode.IsSpace) >= 0 {
		return "", false
	}
	if i := strings.IndexByte(s, '?'); i >= 0 {
		s = s[:i]
	}
	return s, true
}

// parseStatus validates a status code and returns its class, e.g. "2xx".
func parseStatus(s string) (string, bool) {
	if len(s) != 3 || !allDigits(s) || s[0] < '1' || s[0] > '5' {
		return "", false
	}
	return s[:1] + "xx", true
}

// parseLatency parses a latency such as "12ms".
func parseLatency(s string) (int, bool) {
	num, found := strings.CutSuffix(s, "ms")
	if !found || num == "" || !allDigits(num) {
		return 0, false
	}
	n, err := strconv.Atoi(num)
	return n, err == nil
}

func allDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

// parseAgent decodes a quoted user agent that spans the rest of the line.
func parseAgent(s string) (string, bool) {
	if len(s) < 2 || s[0] != '"' || s[len(s)-1] != '"' {
		return "", false
	}
	inner := s[1 : len(s)-1]
	var b strings.Builder
	for i := 0; i < len(inner); i++ {
		c := inner[i]
		if c == '"' {
			return "", false
		}
		if c == '\\' {
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

// topPaths returns up to limit paths by count descending, then path ascending.
func topPaths(entries []entry, limit int) []PathCount {
	counts := map[string]int{}
	for _, e := range entries {
		counts[e.path]++
	}
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
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

// p95 returns the nearest-rank 95th percentile latency; entries is non-empty.
func p95(entries []entry) int {
	lat := make([]int, len(entries))
	for i, e := range entries {
		lat[i] = e.latency
	}
	sort.Ints(lat)
	rank := (95*len(lat) + 99) / 100 // ceil(0.95*N) in integer arithmetic
	return lat[rank-1]
}

// timeRange returns the timestamp texts of the earliest and latest entries,
// preferring the first in input order on ties; entries is non-empty.
func timeRange(entries []entry) (string, string) {
	first, last := entries[0], entries[0]
	for _, e := range entries[1:] {
		if e.ts.Before(first.ts) {
			first = e
		}
		if e.ts.After(last.ts) {
			last = e
		}
	}
	return first.tsText, last.tsText
}

func uniqueAgents(entries []entry) int {
	seen := map[string]bool{}
	for _, e := range entries {
		if e.hasAgent {
			seen[e.agent] = true
		}
	}
	return len(seen)
}
