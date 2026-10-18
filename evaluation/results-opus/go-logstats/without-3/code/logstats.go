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
		rank := (95*n + 99) / 100 // ceil(0.95 * n) without float rounding
		st.P95LatencyMs = latencies[rank-1]
	}
	st.UniqueAgents = len(agents)
	return st
}

// parseLine parses a single non-skipped line, reporting whether it is well-formed.
func parseLine(line string) (entry, bool) {
	var e entry

	// The first four fields never contain spaces; split them off.
	fields := make([]string, 0, 4)
	rest := line
	for len(fields) < 4 {
		idx := strings.IndexByte(rest, ' ')
		if idx < 0 {
			return e, false
		}
		fields = append(fields, rest[:idx])
		rest = rest[idx+1:]
	}
	latencyText, agentText, hasAgent := strings.Cut(rest, " ")

	ts, err := time.Parse(time.RFC3339, fields[0])
	if err != nil {
		return e, false
	}
	e.tsText, e.ts = fields[0], ts

	if !methods[fields[1]] {
		return e, false
	}

	path := fields[2]
	if path == "" || path[0] != '/' || strings.IndexFunc(path, unicode.IsSpace) >= 0 {
		return e, false
	}
	if q := strings.IndexByte(path, '?'); q >= 0 {
		path = path[:q]
	}
	e.path = path

	status := fields[3]
	if len(status) != 3 || !allDigits(status) || status < "100" || status > "599" {
		return e, false
	}
	e.status = status

	digits, ok := strings.CutSuffix(latencyText, "ms")
	if !ok || digits == "" || !allDigits(digits) {
		return e, false
	}
	latency, err := strconv.Atoi(digits)
	if err != nil {
		return e, false
	}
	e.latency = latency

	if hasAgent {
		agent, ok := decodeAgent(agentText)
		if !ok {
			return e, false
		}
		e.agent, e.hasAgent = agent, true
	}
	return e, true
}

// decodeAgent decodes a quoted user agent, reporting whether it is valid.
func decodeAgent(s string) (string, bool) {
	if len(s) < 2 || s[0] != '"' || s[len(s)-1] != '"' {
		return "", false
	}
	inner := s[1 : len(s)-1]
	var b strings.Builder
	for i := 0; i < len(inner); i++ {
		switch c := inner[i]; c {
		case '"':
			return "", false
		case '\\':
			if i+1 >= len(inner) || (inner[i+1] != '"' && inner[i+1] != '\\') {
				return "", false
			}
			i++
			b.WriteByte(inner[i])
		default:
			b.WriteByte(c)
		}
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
