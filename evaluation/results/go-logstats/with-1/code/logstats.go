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
	ts       time.Time
	rawTS    string
	path     string
	status   int
	latency  int
	agent    string
	hasAgent bool
}

// parseAgent decodes a quoted user agent that must span all of s.
func parseAgent(s string) (string, bool) {
	if len(s) < 2 || s[0] != '"' {
		return "", false
	}
	var b strings.Builder
	for i := 1; i < len(s); i++ {
		switch s[i] {
		case '\\':
			i++
			if i >= len(s)-1 || (s[i] != '"' && s[i] != '\\') {
				return "", false
			}
			b.WriteByte(s[i])
		case '"':
			if i != len(s)-1 {
				return "", false
			}
			return b.String(), true
		default:
			b.WriteByte(s[i])
		}
	}
	return "", false
}

func allDigits(s string) bool {
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

func validMethod(m string) bool {
	switch m {
	case "GET", "POST", "PUT", "PATCH", "DELETE":
		return true
	}
	return false
}

// parsePath validates the path token and strips the query string.
func parsePath(p string) (string, bool) {
	if p == "" || p[0] != '/' || strings.IndexFunc(p, unicode.IsSpace) >= 0 {
		return "", false
	}
	path, _, _ := strings.Cut(p, "?")
	return path, true
}

func parseStatus(s string) (int, bool) {
	if len(s) != 3 || !allDigits(s) {
		return 0, false
	}
	n, _ := strconv.Atoi(s)
	return n, n >= 100 && n <= 599
}

func parseLatency(s string) (int, bool) {
	num, ok := strings.CutSuffix(s, "ms")
	if !ok || !allDigits(num) {
		return 0, false
	}
	n, err := strconv.Atoi(num)
	return n, err == nil
}

func parseLine(line string) (entry, bool) {
	f := strings.SplitN(line, " ", 6)
	if len(f) < 5 || !validMethod(f[1]) {
		return entry{}, false
	}
	ts, err := time.Parse(time.RFC3339, f[0])
	if err != nil {
		return entry{}, false
	}
	path, ok1 := parsePath(f[2])
	status, ok2 := parseStatus(f[3])
	lat, ok3 := parseLatency(f[4])
	if !ok1 || !ok2 || !ok3 {
		return entry{}, false
	}
	e := entry{ts: ts, rawTS: f[0], path: path, status: status, latency: lat}
	if len(f) == 6 {
		var ok bool
		if e.agent, ok = parseAgent(f[5]); !ok {
			return entry{}, false
		}
		e.hasAgent = true
	}
	return e, true
}

type acc struct {
	st          Stats
	paths       map[string]int
	agents      map[string]bool
	lats        []int
	first, last time.Time
}

func (a *acc) add(e entry) {
	st := &a.st
	if st.Total == 0 || e.ts.Before(a.first) {
		a.first, st.FirstSeen = e.ts, e.rawTS
	}
	if st.Total == 0 || e.ts.After(a.last) {
		a.last, st.LastSeen = e.ts, e.rawTS
	}
	st.Total++
	st.ByClass[strconv.Itoa(e.status/100)+"xx"]++
	a.paths[e.path]++
	a.lats = append(a.lats, e.latency)
	if e.hasAgent {
		a.agents[e.agent] = true
	}
}

func (a *acc) topPaths() []PathCount {
	top := []PathCount{}
	for p, c := range a.paths {
		top = append(top, PathCount{p, c})
	}
	sort.Slice(top, func(i, j int) bool {
		if top[i].Count != top[j].Count {
			return top[i].Count > top[j].Count
		}
		return top[i].Path < top[j].Path
	})
	if len(top) > 3 {
		top = top[:3]
	}
	return top
}

func (a *acc) p95() int {
	n := len(a.lats)
	if n == 0 {
		return 0
	}
	sort.Ints(a.lats)
	return a.lats[(95*n+99)/100-1]
}

func skipped(line string) bool {
	return strings.TrimSpace(line) == "" || line[0] == '#'
}

// Analyze parses the given access-log lines and returns their statistics.
func Analyze(lines []string) Stats {
	a := &acc{
		st:     Stats{ByClass: map[string]int{}, Malformed: []int{}},
		paths:  map[string]int{},
		agents: map[string]bool{},
	}
	for i, line := range lines {
		if skipped(line) {
			continue
		}
		if e, ok := parseLine(line); ok {
			a.add(e)
		} else {
			a.st.Malformed = append(a.st.Malformed, i+1)
		}
	}
	a.st.TopPaths = a.topPaths()
	a.st.P95LatencyMs = a.p95()
	a.st.UniqueAgents = len(a.agents)
	return a.st
}
