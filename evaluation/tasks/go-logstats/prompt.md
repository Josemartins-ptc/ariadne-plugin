Implement `Analyze` in `logstats.go` (Go module `example.com/gologstats`, package `logstats`). It turns a slice of access-log lines into summary statistics. The types `Stats` and `PathCount` are already declared in `logstats.go`; keep their names and fields as they are. Use only the Go standard library.

```go
func Analyze(lines []string) Stats
```

## Line format

Each log line has five fields separated by single space characters, optionally followed by a sixth:

```
<timestamp> <method> <path> <status> <latency>ms[ "<user agent>"]
```

Example lines:

```
2024-05-01T10:00:00Z GET /home?ref=mail 200 12ms
2024-05-01T10:00:01+02:00 POST /login 302 130ms "Mozilla/5.0 (X11; Linux x86_64)"
2024-05-01T10:00:02Z GET /search 404 7ms "bot \"v2\""
```

A line is **well-formed** when all of the following hold (anything else makes it malformed):

- **Separators:** fields are separated by exactly one space. No leading or trailing spaces, no other whitespace between fields, nothing after the last field.
- **timestamp:** accepted by Go's `time.Parse(time.RFC3339, s)`.
- **method:** exactly one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE` (case-sensitive).
- **path:** a non-empty token starting with `/`. If it contains a `?`, everything from the first `?` onwards is the query string and is dropped: the remaining part is the line's *path* for all statistics (`/a?x=1` and `/a` are the same path; `/?q` is the path `/`).
- **status:** exactly three ASCII digits whose value is between 100 and 599 inclusive.
- **latency:** one or more ASCII digits immediately followed by `ms` (for example `0ms`, `12ms`, `007ms` = 7). The number must fit in a Go `int`. No sign, no decimal point, no other unit.
- **user agent (optional):** if present, it is separated from the latency by one space and is the rest of the line: it starts with `"` and ends with a closing `"` that is the last character of the line. Inside the quotes, `\"` stands for a literal `"` and `\\` for a literal `\`. A backslash followed by any other character, an unescaped `"` before the end, or a missing closing quote makes the line malformed. The user agent's *value* is the decoded text between the quotes (it may contain spaces, and may be empty: `""` is a user agent with the empty value).

## Skipped lines

- A line that is empty or consists only of whitespace (`strings.TrimSpace(line) == ""`) is skipped silently.
- A line whose first character is `#` is a comment and is skipped silently. (A line with whitespace before the `#` is not a comment; it is malformed.)

Skipped lines are neither counted nor reported as malformed. Every other line is either well-formed (a *parsed line*) or malformed.

## Statistics

All statistics except `Malformed` are computed over parsed lines only.

- `Total`: the number of parsed lines.
- `ByClass`: the number of parsed lines per status class. The key is the first digit of the status followed by `xx`: `"1xx"`, `"2xx"`, `"3xx"`, `"4xx"`, `"5xx"`. Only classes with at least one line appear as keys. Never nil (an empty map when there are no parsed lines).
- `TopPaths`: the most requested paths (query string dropped, see above), at most 3 entries, each `PathCount{Path, Count}` where `Count` is the number of parsed lines with that path. Ordered by `Count` descending; paths with the same count are ordered by path ascending (plain Go string comparison). Fewer than 3 entries when there are fewer distinct paths. Never nil (an empty slice when there are no parsed lines).
- `P95LatencyMs`: the 95th percentile of the latencies of the parsed lines, by the nearest-rank method: sort the N latencies ascending; the result is the value at 1-based position `ceil(0.95 × N)`. For example N=1 gives position 1, N=20 gives position 19, N=21 gives position 20, N=100 gives position 95. It is 0 when there are no parsed lines.
- `Malformed`: the 1-based line numbers (position in `lines`, counting every line including skipped ones) of the malformed lines, in ascending order. Never nil (an empty slice when there are none).
- `FirstSeen` / `LastSeen`: the timestamp text, exactly as written in the line, of the parsed line with the earliest / latest point in time. Compare points in time, not text (so `2024-05-01T12:00:00+02:00` is earlier than `2024-05-01T11:00:00Z`). If several parsed lines share the earliest (or latest) point in time, use the text of the first of them in input order. Both are `""` when there are no parsed lines.
- `UniqueAgents`: the number of distinct user agent values (compared after decoding the escapes) among parsed lines that have a user agent. Lines without a user agent do not contribute.

Visible tests are in `logstats_test.go`; run them with `go test ./...`.
