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

type parsedLine struct {
	ts       time.Time
	tsText   string
	path     string
	status   int
	latency  int
	agent    string
	hasAgent bool
}

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

func parseLine(line string) (p parsedLine, ok bool) {
	parts := strings.SplitN(line, " ", 6)
	if len(parts) < 5 {
		return p, false
	}
	for _, f := range parts[:5] {
		if f == "" || strings.IndexFunc(f, unicode.IsSpace) >= 0 {
			return p, false
		}
	}
	ts, err := time.Parse(time.RFC3339, parts[0])
	if err != nil {
		return p, false
	}
	switch parts[1] {
	case "GET", "POST", "PUT", "PATCH", "DELETE":
	default:
		return p, false
	}
	path := parts[2]
	if path[0] != '/' {
		return p, false
	}
	if q := strings.IndexByte(path, '?'); q >= 0 {
		path = path[:q]
	}
	if len(parts[3]) != 3 || !isDigits(parts[3]) {
		return p, false
	}
	status, _ := strconv.Atoi(parts[3])
	if status < 100 || status > 599 {
		return p, false
	}
	lat := parts[4]
	if !strings.HasSuffix(lat, "ms") || !isDigits(lat[:len(lat)-2]) {
		return p, false
	}
	latency, err := strconv.Atoi(lat[:len(lat)-2])
	if err != nil {
		return p, false
	}
	p = parsedLine{ts: ts, tsText: parts[0], path: path, status: status, latency: latency}
	if len(parts) == 6 {
		ua := parts[5]
		if len(ua) < 2 || ua[0] != '"' {
			return p, false
		}
		var sb strings.Builder
		closed := false
		for i := 1; i < len(ua); i++ {
			c := ua[i]
			switch c {
			case '\\':
				if i+1 >= len(ua) || (ua[i+1] != '"' && ua[i+1] != '\\') {
					return p, false
				}
				i++
				sb.WriteByte(ua[i])
			case '"':
				if i != len(ua)-1 {
					return p, false
				}
				closed = true
			default:
				sb.WriteByte(c)
			}
		}
		if !closed {
			return p, false
		}
		p.agent, p.hasAgent = sb.String(), true
	}
	return p, true
}

// Analyze parses the given access-log lines and returns their statistics.
func Analyze(lines []string) Stats {
	st := Stats{ByClass: map[string]int{}, TopPaths: []PathCount{}, Malformed: []int{}}
	paths := map[string]int{}
	agents := map[string]struct{}{}
	var lats []int
	var first, last time.Time
	for i, line := range lines {
		if strings.TrimSpace(line) == "" || line[0] == '#' {
			continue
		}
		p, ok := parseLine(line)
		if !ok {
			st.Malformed = append(st.Malformed, i+1)
			continue
		}
		if st.Total == 0 || p.ts.Before(first) {
			first, st.FirstSeen = p.ts, p.tsText
		}
		if st.Total == 0 || p.ts.After(last) {
			last, st.LastSeen = p.ts, p.tsText
		}
		st.Total++
		st.ByClass[strconv.Itoa(p.status/100)+"xx"]++
		paths[p.path]++
		lats = append(lats, p.latency)
		if p.hasAgent {
			agents[p.agent] = struct{}{}
		}
	}
	st.UniqueAgents = len(agents)
	for k, v := range paths {
		st.TopPaths = append(st.TopPaths, PathCount{k, v})
	}
	sort.Slice(st.TopPaths, func(a, b int) bool {
		x, y := st.TopPaths[a], st.TopPaths[b]
		if x.Count != y.Count {
			return x.Count > y.Count
		}
		return x.Path < y.Path
	})
	if len(st.TopPaths) > 3 {
		st.TopPaths = st.TopPaths[:3]
	}
	if n := len(lats); n > 0 {
		sort.Ints(lats)
		st.P95LatencyMs = lats[(95*n+99)/100-1]
	}
	return st
}
