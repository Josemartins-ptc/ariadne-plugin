// Package logstats computes summary statistics over access-log lines.
package logstats

import (
	"sort"
	"strconv"
	"strings"
	"time"
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
	timeText string
	time     time.Time
	method   string
	path     string
	status   int
	latency  int
	hasAgent bool
	agent    string
}

var validMethods = map[string]bool{"GET": true, "POST": true, "PUT": true, "PATCH": true, "DELETE": true}

const topPathLimit = 3

// Analyze parses the given access-log lines and returns their statistics.
func Analyze(lines []string) Stats {
	var entries []entry
	malformed := []int{}
	for i, line := range lines {
		if strings.TrimSpace(line) == "" || strings.HasPrefix(line, "#") {
			continue
		}
		e, ok := parseLine(line)
		if !ok {
			malformed = append(malformed, i+1)
			continue
		}
		entries = append(entries, e)
	}
	stats := summarize(entries)
	stats.Malformed = malformed
	return stats
}

func parseLine(line string) (entry, bool) {
	fields := strings.SplitN(line, " ", 6)
	if len(fields) < 5 {
		return entry{}, false
	}
	var e entry
	t, err := time.Parse(time.RFC3339, fields[0])
	if err != nil {
		return entry{}, false
	}
	e.timeText, e.time = fields[0], t
	if !validMethods[fields[1]] {
		return entry{}, false
	}
	e.method = fields[1]
	if !strings.HasPrefix(fields[2], "/") {
		return entry{}, false
	}
	e.path = fields[2]
	if i := strings.Index(e.path, "?"); i >= 0 {
		e.path = e.path[:i]
	}
	status, ok := parseDigits(fields[3])
	if !ok || len(fields[3]) != 3 || status < 100 || status > 599 {
		return entry{}, false
	}
	e.status = status
	if !strings.HasSuffix(fields[4], "ms") {
		return entry{}, false
	}
	latency, ok := parseDigits(strings.TrimSuffix(fields[4], "ms"))
	if !ok {
		return entry{}, false
	}
	e.latency = latency
	if len(fields) == 6 {
		agent, ok := parseAgent(fields[5])
		if !ok {
			return entry{}, false
		}
		e.hasAgent, e.agent = true, agent
	}
	return e, true
}

func parseDigits(s string) (int, bool) {
	if s == "" {
		return 0, false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, false
		}
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0, false
	}
	return n, true
}

// parseAgent decodes a double-quoted user agent that must span the whole of s.
func parseAgent(s string) (string, bool) {
	if len(s) < 2 || s[0] != '"' {
		return "", false
	}
	var b strings.Builder
	for i := 1; i < len(s); i++ {
		c := s[i]
		switch c {
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

func summarize(entries []entry) Stats {
	stats := Stats{ByClass: map[string]int{}, TopPaths: []PathCount{}}
	stats.Total = len(entries)
	pathCounts := map[string]int{}
	agents := map[string]bool{}
	latencies := make([]int, 0, len(entries))
	var first, last *entry
	for i := range entries {
		e := &entries[i]
		stats.ByClass[strconv.Itoa(e.status/100)+"xx"]++
		pathCounts[e.path]++
		if e.hasAgent {
			agents[e.agent] = true
		}
		latencies = append(latencies, e.latency)
		if first == nil || e.time.Before(first.time) {
			first = e
		}
		if last == nil || e.time.After(last.time) {
			last = e
		}
	}
	stats.UniqueAgents = len(agents)
	if first != nil {
		stats.FirstSeen, stats.LastSeen = first.timeText, last.timeText
	}
	stats.P95LatencyMs = nearestRankP95(latencies)
	stats.TopPaths = topPaths(pathCounts)
	return stats
}

func nearestRankP95(latencies []int) int {
	if len(latencies) == 0 {
		return 0
	}
	sort.Ints(latencies)
	rank := (95*len(latencies) + 99) / 100
	return latencies[rank-1]
}

func topPaths(counts map[string]int) []PathCount {
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
	if len(all) > topPathLimit {
		all = all[:topPathLimit]
	}
	return all
}
