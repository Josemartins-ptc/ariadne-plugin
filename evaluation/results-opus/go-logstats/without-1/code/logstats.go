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
}

// entry is a single well-formed log line.
type entry struct {
	tsText   string
	ts       time.Time
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
	st := Stats{
		ByClass:   map[string]int{},
		TopPaths:  []PathCount{},
		Malformed: []int{},
	}

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

		if st.Total == 0 || e.ts.Before(first) {
			first, st.FirstSeen = e.ts, e.tsText
		}
		if st.Total == 0 || e.ts.After(last) {
			last, st.LastSeen = e.ts, e.tsText
		}
		st.Total++
		st.ByClass[e.status[:1]+"xx"]++
		pathCounts[e.path]++
		latencies = append(latencies, e.latency)
		if e.hasAgent {
			agents[e.agent] = struct{}{}
		}
	}

	for p, c := range pathCounts {
		st.TopPaths = append(st.TopPaths, PathCount{Path: p, Count: c})
	}
	sort.Slice(st.TopPaths, func(a, b int) bool {
		pa, pb := st.TopPaths[a], st.TopPaths[b]
		if pa.Count != pb.Count {
			return pa.Count > pb.Count
		}
		return pa.Path < pb.Path
	})
	if len(st.TopPaths) > 3 {
		st.TopPaths = st.TopPaths[:3]
	}

	if n := len(latencies); n > 0 {
		sort.Ints(latencies)
		// Nearest rank: ceil(0.95*n), computed exactly as ceil(95n/100).
		rank := (95*n + 99) / 100
		st.P95LatencyMs = latencies[rank-1]
	}

	st.UniqueAgents = len(agents)
	return st
}

// parseLine parses a non-skipped line, reporting whether it is well-formed.
func parseLine(line string) (entry, bool) {
	var e entry
	parts := strings.SplitN(line, " ", 6)
	if len(parts) < 5 {
		return e, false
	}

	ts, err := time.Parse(time.RFC3339, parts[0])
	if err != nil {
		return e, false
	}
	e.tsText, e.ts = parts[0], ts

	if !methods[parts[1]] {
		return e, false
	}

	path := parts[2]
	if !strings.HasPrefix(path, "/") || strings.IndexFunc(path, unicode.IsSpace) >= 0 {
		return e, false
	}
	if q := strings.IndexByte(path, '?'); q >= 0 {
		path = path[:q]
	}
	e.path = path

	status := parts[3]
	if len(status) != 3 || !allDigits(status) || status < "100" || status > "599" {
		return e, false
	}
	e.status = status

	lat, ok := strings.CutSuffix(parts[4], "ms")
	if !ok || lat == "" || !allDigits(lat) {
		return e, false
	}
	n, err := strconv.Atoi(lat)
	if err != nil {
		return e, false
	}
	e.latency = n

	if len(parts) == 6 {
		agent, ok := decodeAgent(parts[5])
		if !ok {
			return e, false
		}
		e.agent, e.hasAgent = agent, true
	}
	return e, true
}

// decodeAgent decodes a quoted user agent that must span the whole of s.
func decodeAgent(s string) (string, bool) {
	if len(s) < 2 || s[0] != '"' {
		return "", false
	}
	var b strings.Builder
	for i := 1; i < len(s); i++ {
		switch c := s[i]; c {
		case '\\':
			if i+1 >= len(s) || (s[i+1] != '"' && s[i+1] != '\\') {
				return "", false
			}
			b.WriteByte(s[i+1])
			i++
		case '"':
			if i != len(s)-1 {
				return "", false
			}
			return b.String(), true
		default:
			b.WriteByte(c)
		}
	}
	return "", false
}

func allDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}
