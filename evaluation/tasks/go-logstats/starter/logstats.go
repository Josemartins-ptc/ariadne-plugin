// Package logstats computes summary statistics over access-log lines.
package logstats

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

// Analyze parses the given access-log lines and returns their statistics.
func Analyze(lines []string) Stats {
	return Stats{}
}
