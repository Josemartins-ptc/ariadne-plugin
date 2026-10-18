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

// parseAgent decodes a quoted user agent that spans the whole of s.
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

// Analyze parses the given access-log lines and returns their statistics.
func Analyze(lines []string) Stats {
	return AnalyzeFiltered(lines, Filter{})
}

// AnalyzeFiltered is like Analyze but only counts parsed lines passing f.
// Malformed lines are always reported.
func AnalyzeFiltered(lines []string, flt Filter) Stats {
	var from, to time.Time
	hasFrom, hasTo := flt.From != "", flt.To != ""
	if hasFrom {
		from, _ = time.Parse(time.RFC3339, flt.From)
	}
	if hasTo {
		to, _ = time.Parse(time.RFC3339, flt.To)
	}
	methods := map[string]bool{}
	for _, m := range flt.Methods {
		methods[m] = true
	}

	st := Stats{ByClass: map[string]int{}, ByMethod: map[string]int{}, TopPaths: []PathCount{}, Malformed: []int{}}
	counts := map[string]int{}
	agents := map[string]bool{}
	var lats []int
	var first, last time.Time

	for n, line := range lines {
		if strings.TrimSpace(line) == "" || line[0] == '#' {
			continue
		}
		bad := func() { st.Malformed = append(st.Malformed, n+1) }
		f := strings.SplitN(line, " ", 6)
		if len(f) < 5 {
			bad()
			continue
		}
		ts, err := time.Parse(time.RFC3339, f[0])
		if err != nil {
			bad()
			continue
		}
		switch f[1] {
		case "GET", "POST", "PUT", "PATCH", "DELETE":
		default:
			bad()
			continue
		}
		path := f[2]
		if path == "" || path[0] != '/' || strings.IndexFunc(path, unicode.IsSpace) >= 0 {
			bad()
			continue
		}
		if q := strings.IndexByte(path, '?'); q >= 0 {
			path = path[:q]
		}
		if len(f[3]) != 3 || !allDigits(f[3]) || f[3] < "100" || f[3] > "599" {
			bad()
			continue
		}
		if !strings.HasSuffix(f[4], "ms") || !allDigits(f[4][:len(f[4])-2]) {
			bad()
			continue
		}
		lat, err := strconv.Atoi(f[4][:len(f[4])-2])
		if err != nil {
			bad()
			continue
		}
		agent, hasAgent := "", false
		if len(f) == 6 {
			agent, hasAgent = parseAgent(f[5])
			if !hasAgent {
				bad()
				continue
			}
		}

		if len(methods) > 0 && !methods[f[1]] {
			continue
		}
		if (hasFrom && ts.Before(from)) || (hasTo && ts.After(to)) {
			continue
		}

		st.Total++
		st.ByMethod[f[1]]++
		st.ByClass[f[3][:1]+"xx"]++
		counts[path]++
		lats = append(lats, lat)
		if hasAgent {
			agents[agent] = true
		}
		if st.Total == 1 || ts.Before(first) {
			first, st.FirstSeen = ts, f[0]
		}
		if st.Total == 1 || ts.After(last) {
			last, st.LastSeen = ts, f[0]
		}
	}

	for p, c := range counts {
		st.TopPaths = append(st.TopPaths, PathCount{p, c})
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
	if len(lats) > 0 {
		sort.Ints(lats)
		st.P95LatencyMs = lats[(95*len(lats)+99)/100-1]
	}
	st.UniqueAgents = len(agents)
	return st
}
