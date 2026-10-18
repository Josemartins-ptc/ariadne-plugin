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

// Filter selects which parsed lines AnalyzeFiltered counts.
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
	status   int
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

// AnalyzeFiltered is like Analyze, but computes every statistic except
// Malformed only over the parsed lines that pass f.
func AnalyzeFiltered(lines []string, f Filter) Stats {
	keep := f.matcher()
	var entries []entry
	malformed := []int{}
	for i, line := range lines {
		if strings.TrimSpace(line) == "" || line[0] == '#' {
			continue
		}
		e, ok := parseLine(line)
		if !ok {
			malformed = append(malformed, i+1)
			continue
		}
		if keep(e) {
			entries = append(entries, e)
		}
	}
	st := summarize(entries)
	st.Malformed = malformed
	return st
}

// matcher returns a predicate reporting whether an entry passes f.
func (f Filter) matcher() func(entry) bool {
	var from, to time.Time
	hasFrom, hasTo := f.From != "", f.To != ""
	if hasFrom {
		from, _ = time.Parse(time.RFC3339, f.From)
	}
	if hasTo {
		to, _ = time.Parse(time.RFC3339, f.To)
	}
	return func(e entry) bool {
		if len(f.Methods) > 0 && !slices.Contains(f.Methods, e.method) {
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

// parseLine parses a single non-skipped line, reporting whether it is well-formed.
func parseLine(line string) (entry, bool) {
	fields := strings.SplitN(line, " ", 6)
	if len(fields) < 5 || !methods[fields[1]] {
		return entry{}, false
	}
	ts, err := time.Parse(time.RFC3339, fields[0])
	path, okPath := parsePath(fields[2])
	status, okStatus := parseStatus(fields[3])
	latency, okLatency := parseLatency(fields[4])
	if err != nil || !okPath || !okStatus || !okLatency {
		return entry{}, false
	}
	e := entry{tsText: fields[0], ts: ts, method: fields[1], path: path, status: status, latency: latency}
	if len(fields) == 6 {
		var ok bool
		if e.agent, ok = parseAgent(fields[5]); !ok {
			return entry{}, false
		}
		e.hasAgent = true
	}
	return e, true
}

// parsePath validates a path token and strips its query string.
func parsePath(s string) (string, bool) {
	if !strings.HasPrefix(s, "/") || strings.IndexFunc(s, unicode.IsSpace) >= 0 {
		return "", false
	}
	if i := strings.IndexByte(s, '?'); i >= 0 {
		s = s[:i]
	}
	return s, true
}

// isDigits reports whether s is a non-empty run of ASCII digits.
func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

func parseStatus(s string) (int, bool) {
	if len(s) != 3 || !isDigits(s) {
		return 0, false
	}
	n, _ := strconv.Atoi(s)
	return n, n >= 100 && n <= 599
}

func parseLatency(s string) (int, bool) {
	digits, found := strings.CutSuffix(s, "ms")
	if !found || !isDigits(digits) {
		return 0, false
	}
	n, err := strconv.Atoi(digits)
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
		if c == '"' {
			return "", false
		}
		if c == '\\' {
			i++
			if i >= len(inner) || (inner[i] != '"' && inner[i] != '\\') {
				return "", false
			}
			c = inner[i]
		}
		b.WriteByte(c)
	}
	return b.String(), true
}

// summarize computes every statistic except Malformed over parsed entries.
func summarize(entries []entry) Stats {
	st := Stats{Total: len(entries), ByClass: map[string]int{}, ByMethod: map[string]int{}}
	pathCounts := map[string]int{}
	agents := map[string]bool{}
	latencies := make([]int, 0, len(entries))
	for _, e := range entries {
		st.ByClass[strconv.Itoa(e.status/100)+"xx"]++
		st.ByMethod[e.method]++
		pathCounts[e.path]++
		latencies = append(latencies, e.latency)
		if e.hasAgent {
			agents[e.agent] = true
		}
	}
	st.FirstSeen, st.LastSeen = timeBounds(entries)
	st.TopPaths = topPaths(pathCounts, 3)
	st.P95LatencyMs = p95(latencies)
	st.UniqueAgents = len(agents)
	return st
}

// timeBounds returns the timestamp text of the earliest and latest entries,
// preferring the first in input order on ties.
func timeBounds(entries []entry) (string, string) {
	if len(entries) == 0 {
		return "", ""
	}
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

// topPaths returns up to n paths by count descending, then path ascending.
func topPaths(counts map[string]int, n int) []PathCount {
	all := make([]PathCount, 0, len(counts))
	for p, c := range counts {
		all = append(all, PathCount{Path: p, Count: c})
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].Count != all[j].Count {
			return all[i].Count > all[j].Count
		}
		return all[i].Path < all[j].Path
	})
	if len(all) > n {
		all = all[:n]
	}
	return all
}

// p95 returns the nearest-rank 95th percentile, or 0 for no values.
func p95(values []int) int {
	if len(values) == 0 {
		return 0
	}
	sort.Ints(values)
	rank := (95*len(values) + 99) / 100
	return values[rank-1]
}
