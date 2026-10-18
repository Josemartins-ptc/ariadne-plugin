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
	raw     string
	path    string
	status  int
	latency int
	agent   string
	hasUA   bool
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

func parseLine(line string) (entry, bool) {
	var e entry
	var f [5]string
	rest := line
	for i := 0; i < 4; i++ {
		j := strings.IndexByte(rest, ' ')
		if j < 0 {
			return e, false
		}
		f[i], rest = rest[:j], rest[j+1:]
	}
	if j := strings.IndexByte(rest, ' '); j >= 0 {
		f[4] = rest[:j]
		var ok bool
		if e.agent, ok = parseAgent(rest[j+1:]); !ok {
			return e, false
		}
		e.hasUA = true
	} else {
		f[4] = rest
	}
	ts, err := time.Parse(time.RFC3339, f[0])
	if err != nil {
		return e, false
	}
	switch f[1] {
	case "GET", "POST", "PUT", "PATCH", "DELETE":
	default:
		return e, false
	}
	path := f[2]
	if path == "" || path[0] != '/' || strings.IndexFunc(path, unicode.IsSpace) >= 0 {
		return e, false
	}
	if q := strings.IndexByte(path, '?'); q >= 0 {
		path = path[:q]
	}
	if len(f[3]) != 3 || !isDigits(f[3]) {
		return e, false
	}
	status, _ := strconv.Atoi(f[3])
	if status < 100 || status > 599 {
		return e, false
	}
	if !strings.HasSuffix(f[4], "ms") || !isDigits(f[4][:len(f[4])-2]) {
		return e, false
	}
	lat, err := strconv.Atoi(f[4][:len(f[4])-2])
	if err != nil {
		return e, false
	}
	e.ts, e.raw, e.path, e.status, e.latency = ts, f[0], path, status, lat
	return e, true
}

// Analyze parses the given access-log lines and returns their statistics.
func Analyze(lines []string) Stats {
	st := Stats{ByClass: map[string]int{}, TopPaths: []PathCount{}, Malformed: []int{}}
	paths := map[string]int{}
	agents := map[string]bool{}
	var lats []int
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
		st.Total++
		st.ByClass[strconv.Itoa(e.status/100)+"xx"]++
		paths[e.path]++
		lats = append(lats, e.latency)
		if e.hasUA {
			agents[e.agent] = true
		}
		if st.Total == 1 || e.ts.Before(first) {
			first, st.FirstSeen = e.ts, e.raw
		}
		if st.Total == 1 || e.ts.After(last) {
			last, st.LastSeen = e.ts, e.raw
		}
	}
	for p, c := range paths {
		st.TopPaths = append(st.TopPaths, PathCount{p, c})
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
	st.UniqueAgents = len(agents)
	return st
}
