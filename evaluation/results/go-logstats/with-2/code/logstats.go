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

type entry struct {
	ts      time.Time
	rawTS   string
	path    string
	status  int
	latency int
	agent   string
	hasUA   bool
}

func parseUA(s string) (string, bool) {
	if len(s) < 2 || s[0] != '"' {
		return "", false
	}
	var b strings.Builder
	for i := 1; i < len(s); i++ {
		switch c := s[i]; c {
		case '\\':
			i++
			if i >= len(s) || (s[i] != '"' && s[i] != '\\') {
				return "", false
			}
			b.WriteByte(s[i])
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

// splitFields returns the four leading fields, the latency token and the
// optional raw user-agent remainder.
func splitFields(line string) (head [4]string, lat, ua string, hasUA, ok bool) {
	rest := line
	for n := range head {
		i := strings.IndexByte(rest, ' ')
		if i < 0 {
			return head, "", "", false, false
		}
		head[n], rest = rest[:i], rest[i+1:]
	}
	lat = rest
	if i := strings.IndexByte(rest, ' '); i >= 0 {
		lat, ua, hasUA = rest[:i], rest[i+1:], true
	}
	return head, lat, ua, hasUA, true
}

func validMethod(m string) bool {
	switch m {
	case "GET", "POST", "PUT", "PATCH", "DELETE":
		return true
	}
	return false
}

func parsePath(p string) (string, bool) {
	if strings.IndexFunc(p, unicode.IsSpace) >= 0 {
		return "", false
	}
	p, _, _ = strings.Cut(p, "?")
	return p, strings.HasPrefix(p, "/")
}

func parseStatus(st string) (int, bool) {
	if len(st) != 3 || !allDigits(st) {
		return 0, false
	}
	n, _ := strconv.Atoi(st)
	return n, n >= 100 && n <= 599
}

func parseLatency(lat string) (int, bool) {
	num, ok := strings.CutSuffix(lat, "ms")
	if !ok || num == "" || !allDigits(num) {
		return 0, false
	}
	n, err := strconv.Atoi(num)
	return n, err == nil
}

func parseLine(line string) (entry, bool) {
	var e entry
	head, lat, ua, hasUA, ok := splitFields(line)
	if !ok {
		return e, false
	}
	e.hasUA = hasUA
	if hasUA {
		if e.agent, ok = parseUA(ua); !ok {
			return e, false
		}
	}
	ts, err := time.Parse(time.RFC3339, head[0])
	if err != nil || !validMethod(head[1]) {
		return e, false
	}
	e.ts, e.rawTS = ts, head[0]
	if e.path, ok = parsePath(head[2]); !ok {
		return e, false
	}
	if e.status, ok = parseStatus(head[3]); !ok {
		return e, false
	}
	e.latency, ok = parseLatency(lat)
	return e, ok
}

// acc accumulates statistics over parsed entries.
type acc struct {
	stats       Stats
	paths       map[string]int
	agents      map[string]struct{}
	lats        []int
	first, last time.Time
}

func (a *acc) add(e entry) {
	s := &a.stats
	s.Total++
	s.ByClass[strconv.Itoa(e.status/100)+"xx"]++
	a.paths[e.path]++
	a.lats = append(a.lats, e.latency)
	if e.hasUA {
		a.agents[e.agent] = struct{}{}
	}
	if s.Total == 1 || e.ts.Before(a.first) {
		a.first, s.FirstSeen = e.ts, e.rawTS
	}
	if s.Total == 1 || e.ts.After(a.last) {
		a.last, s.LastSeen = e.ts, e.rawTS
	}
}

func skipped(line string) bool {
	return strings.TrimSpace(line) == "" || line[0] == '#'
}

// Analyze parses the given access-log lines and returns their statistics.
func Analyze(lines []string) Stats {
	a := &acc{
		stats:  Stats{ByClass: map[string]int{}, Malformed: []int{}},
		paths:  map[string]int{},
		agents: map[string]struct{}{},
	}
	for idx, line := range lines {
		if skipped(line) {
			continue
		}
		e, ok := parseLine(line)
		if !ok {
			a.stats.Malformed = append(a.stats.Malformed, idx+1)
			continue
		}
		a.add(e)
	}
	s := a.stats
	s.UniqueAgents = len(a.agents)
	s.TopPaths = topPaths(a.paths)
	s.P95LatencyMs = p95(a.lats)
	return s
}

func topPaths(paths map[string]int) []PathCount {
	out := []PathCount{}
	for p, c := range paths {
		out = append(out, PathCount{p, c})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Path < out[j].Path
	})
	if len(out) > 3 {
		out = out[:3]
	}
	return out
}

func p95(lats []int) int {
	n := len(lats)
	if n == 0 {
		return 0
	}
	sort.Ints(lats)
	return lats[(n*95+99)/100-1]
}
