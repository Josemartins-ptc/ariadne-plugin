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

// Filter restricts which parsed lines are counted.
type Filter struct {
	Methods []string // methods to keep; empty or nil = all methods
	From    string   // RFC3339 timestamp, inclusive lower bound; "" = no lower bound
	To      string   // RFC3339 timestamp, inclusive upper bound; "" = no upper bound
}

type parsedLine struct {
	ts       time.Time
	tsText   string
	method   string
	path     string
	status   int
	latency  int
	agent    string
	hasAgent bool
}

func hasSpace(s string) bool {
	return strings.IndexFunc(s, unicode.IsSpace) >= 0
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

// parseAgent decodes a quoted user agent that spans all of s.
func parseAgent(s string) (string, bool) {
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
			i++
			b.WriteByte(s[i])
		case '"':
			return b.String(), i == len(s)-1
		default:
			b.WriteByte(c)
		}
	}
	return "", false
}

func validMethod(m string) bool {
	switch m {
	case "GET", "POST", "PUT", "PATCH", "DELETE":
		return true
	}
	return false
}

// parsePath validates a path token and drops its query string.
func parsePath(s string) (string, bool) {
	if s[0] != '/' {
		return "", false
	}
	path, _, _ := strings.Cut(s, "?")
	return path, true
}

func parseStatus(s string) (int, bool) {
	if len(s) != 3 || !allDigits(s) {
		return 0, false
	}
	v, _ := strconv.Atoi(s)
	return v, v >= 100 && v <= 599
}

func parseLatency(s string) (int, bool) {
	digits, ok := strings.CutSuffix(s, "ms")
	if !ok || !allDigits(digits) {
		return 0, false
	}
	v, err := strconv.Atoi(digits)
	return v, err == nil
}

func parseLine(line string) (parsedLine, bool) {
	parts := strings.SplitN(line, " ", 6)
	if len(parts) < 5 {
		return parsedLine{}, false
	}
	for _, f := range parts[:5] {
		if f == "" || hasSpace(f) {
			return parsedLine{}, false
		}
	}
	ts, err := time.Parse(time.RFC3339, parts[0])
	path, pathOK := parsePath(parts[2])
	status, statusOK := parseStatus(parts[3])
	latency, latOK := parseLatency(parts[4])
	if err != nil || !validMethod(parts[1]) || !pathOK || !statusOK || !latOK {
		return parsedLine{}, false
	}
	p := parsedLine{ts: ts, tsText: parts[0], method: parts[1], path: path, status: status, latency: latency}
	if len(parts) == 6 {
		agent, ok := parseAgent(parts[5])
		p.agent, p.hasAgent = agent, true
		return p, ok
	}
	return p, true
}

// accumulator collects statistics over parsed lines.
type accumulator struct {
	st          Stats
	paths       map[string]int
	agents      map[string]struct{}
	lats        []int
	first, last time.Time
}

func (a *accumulator) add(p parsedLine) {
	isFirst := a.st.Total == 0
	a.st.Total++
	a.st.ByClass[strconv.Itoa(p.status/100)+"xx"]++
	a.st.ByMethod[p.method]++
	a.paths[p.path]++
	a.lats = append(a.lats, p.latency)
	if p.hasAgent {
		a.agents[p.agent] = struct{}{}
	}
	if isFirst || p.ts.Before(a.first) {
		a.first, a.st.FirstSeen = p.ts, p.tsText
	}
	if isFirst || p.ts.After(a.last) {
		a.last, a.st.LastSeen = p.ts, p.tsText
	}
}

func (a *accumulator) topPaths() []PathCount {
	top := []PathCount{}
	for path, c := range a.paths {
		top = append(top, PathCount{path, c})
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

func (a *accumulator) p95() int {
	n := len(a.lats)
	if n == 0 {
		return 0
	}
	sort.Ints(a.lats)
	return a.lats[(95*n+99)/100-1]
}

func skipLine(line string) bool {
	return strings.TrimSpace(line) == "" || line[0] == '#'
}

// Analyze parses the given access-log lines and returns their statistics.
func Analyze(lines []string) Stats {
	return AnalyzeFiltered(lines, Filter{})
}

// AnalyzeFiltered is like Analyze but only counts parsed lines passing f.
// Malformed lists every malformed line regardless of the filter.
func AnalyzeFiltered(lines []string, f Filter) Stats {
	var from, to time.Time
	hasFrom, hasTo := false, false
	if f.From != "" {
		if t, err := time.Parse(time.RFC3339, f.From); err == nil {
			from, hasFrom = t, true
		}
	}
	if f.To != "" {
		if t, err := time.Parse(time.RFC3339, f.To); err == nil {
			to, hasTo = t, true
		}
	}
	methods := map[string]struct{}{}
	for _, m := range f.Methods {
		methods[m] = struct{}{}
	}
	a := &accumulator{
		st:     Stats{ByClass: map[string]int{}, ByMethod: map[string]int{}, Malformed: []int{}},
		paths:  map[string]int{},
		agents: map[string]struct{}{},
	}
	for i, line := range lines {
		if skipLine(line) {
			continue
		}
		p, ok := parseLine(line)
		if !ok {
			a.st.Malformed = append(a.st.Malformed, i+1)
			continue
		}
		if _, in := methods[p.method]; len(methods) > 0 && !in {
			continue
		}
		if (hasFrom && p.ts.Before(from)) || (hasTo && p.ts.After(to)) {
			continue
		}
		a.add(p)
	}
	a.st.UniqueAgents = len(a.agents)
	a.st.TopPaths = a.topPaths()
	a.st.P95LatencyMs = a.p95()
	return a.st
}
