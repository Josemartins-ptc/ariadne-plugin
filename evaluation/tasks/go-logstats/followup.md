Please extend the log statistics in `logstats.go` with filtering and per-method counts.

1. Add a `Filter` type and a new function:

```go
type Filter struct {
	Methods []string // methods to keep; empty or nil = all methods
	From    string   // RFC3339 timestamp, inclusive lower bound; "" = no lower bound
	To      string   // RFC3339 timestamp, inclusive upper bound; "" = no upper bound
}

func AnalyzeFiltered(lines []string, f Filter) Stats
```

   A parsed (well-formed) line passes the filter when all of these hold:
   - `Methods` is empty, or the line's method is equal to one of its entries (exact, case-sensitive comparison).
   - `From` is `""`, or the line's timestamp is at or after `From` as a point in time.
   - `To` is `""`, or the line's timestamp is at or before `To` as a point in time.

   Time comparisons use points in time, not text, so time zones are respected (`2024-05-01T12:00:00+02:00` equals `2024-05-01T10:00:00Z`). You may assume `From` and `To` are always either `""` or accepted by `time.Parse(time.RFC3339, ...)`.

   Every statistic (`Total`, `ByClass`, `TopPaths`, `P95LatencyMs`, `FirstSeen`, `LastSeen`, `UniqueAgents` and the new `ByMethod`) is computed only over the parsed lines that pass the filter, with exactly the same rules as before. The one exception is `Malformed`: it still lists every malformed line of the input (same 1-based numbering, ascending), because a malformed line cannot be judged against the filter. Skipped lines (blank and `#` comments) stay skipped.

2. Add a field `ByMethod map[string]int` to `Stats`: the number of counted lines per method (`"GET"`, `"POST"`, `"PUT"`, `"PATCH"`, `"DELETE"`). Only methods with at least one counted line appear as keys. Never nil (an empty map when no line is counted).

3. `Analyze(lines)` keeps its current behaviour and now also fills `ByMethod`; it gives the same result as `AnalyzeFiltered(lines, Filter{})`.

Keep the existing tests in `logstats_test.go` passing; run them with `go test ./...`.
