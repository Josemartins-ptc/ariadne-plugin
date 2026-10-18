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

// Filter selects which parsed lines are counted by AnalyzeFiltered.
type Filter struct {
	Methods []string // methods to keep; empty or nil = all methods
	From    string   // RFC3339 timestamp, inclusive lower bound; "" = no lower bound
	To      string   // RFC3339 timestamp, inclusive upper bound; "" = no upper bound
}

// Analyze parses the given access-log lines and returns their statistics.
func Analyze(lines []string) Stats {
	return AnalyzeFiltered(lines, Filter{})
}

// AnalyzeFiltered is like Analyze, but computes every statistic except
// Malformed only over the parsed lines that pass f.
func AnalyzeFiltered(lines []string, f Filter) Stats {
	st := Stats{
		ByClass:   map[string]int{},
		TopPaths:  []PathCount{},
		Malformed: []int{},
		ByMethod:  map[string]int{},
	}
	keep := f.matcher()
	pathCounts := map[string]int{}
	agents := map[string]struct{}{}
	var latencies []int
	var first, last time.Time

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
		st.Total++
		st.ByClass[e.status[:1]+"xx"]++
		st.ByMethod[e.method]++
		pathCounts[e.path]++
		latencies = append(latencies, e.latency)
		if e.hasAgent {
			agents[e.agent] = struct{}{}
		}
		if st.Total == 1 || e.ts.Before(first) {
			first, st.FirstSeen = e.ts, e.tsText
		}
		if st.Total == 1 || e.ts.After(last) {
			last, st.LastSeen = e.ts, e.tsText
		}
	}

	for p, c := range pathCounts {
		st.TopPaths = append(st.TopPaths, PathCount{Path: p, Count: c})
	}
	sort.Slice(st.TopPaths, func(i, j int) bool {
		a, b := st.TopPaths[i], st.TopPaths[j]
		if a.Count != b.Count {
			return a.Count > b.Count
		}
		return a.Path < b.Path
	})
	if len(st.TopPaths) > 3 {
		st.TopPaths = st.TopPaths[:3]
	}

	if n := len(latencies); n > 0 {
		sort.Ints(latencies)
		// Nearest rank: 1-based position ceil(0.95*n), in integer arithmetic.
		st.P95LatencyMs = latencies[(95*n+99)/100-1]
	}
	st.UniqueAgents = len(agents)
	return st
}

// matcher returns a predicate reporting whether a parsed entry passes f.
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

// entry is a single well-formed log line.
type entry struct {
	ts       time.Time
	tsText   string
	method   string
	path     string
	status   string
	latency  int
	agent    string
	hasAgent bool
}

var methods = map[string]bool{"GET": true, "POST": true, "PUT": true, "PATCH": true, "DELETE": true}

// parseLine parses a single non-skipped line, reporting whether it is well-formed.
func parseLine(line string) (entry, bool) {
	var e entry
	f := strings.SplitN(line, " ", 6)
	if len(f) < 5 {
		return e, false
	}

	ts, err := time.Parse(time.RFC3339, f[0])
	if err != nil {
		return e, false
	}
	e.ts, e.tsText = ts, f[0]

	if !methods[f[1]] {
		return e, false
	}
	e.method = f[1]

	p := f[2]
	if p == "" || p[0] != '/' || strings.IndexFunc(p, unicode.IsSpace) >= 0 {
		return e, false
	}
	if q := strings.IndexByte(p, '?'); q >= 0 {
		p = p[:q]
	}
	e.path = p

	s := f[3]
	if len(s) != 3 || !allDigits(s) || s[0] < '1' || s[0] > '5' {
		return e, false
	}
	e.status = s

	l, ok := strings.CutSuffix(f[4], "ms")
	if !ok || l == "" || !allDigits(l) {
		return e, false
	}
	if e.latency, err = strconv.Atoi(l); err != nil {
		return e, false
	}

	if len(f) == 6 {
		if e.agent, ok = decodeAgent(f[5]); !ok {
			return e, false
		}
		e.hasAgent = true
	}
	return e, true
}

func allDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

// decodeAgent decodes a quoted user agent that must span the whole of s.
func decodeAgent(s string) (string, bool) {
	if len(s) < 2 || s[0] != '"' {
		return "", false
	}
	var b strings.Builder
	for i := 1; i < len(s); i++ {
		switch c := s[i]; c {
		case '"':
			return b.String(), i == len(s)-1
		case '\\':
			if i+1 >= len(s) || (s[i+1] != '"' && s[i+1] != '\\') {
				return "", false
			}
			i++
			b.WriteByte(s[i])
		default:
			b.WriteByte(c)
		}
	}
	return "", false
}
