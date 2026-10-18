## Raw runs

| task | arm | rep | hidden | cost $ | tokens | turns | wall s | functions | CCN max | cognitive max | Ariadne over | edit/stop blocks | follow-up hidden | first tests after | follow-up cost $ | follow-up tokens | lines changed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| go-logstats | with | 1 | 28/28 | 0.351 | 199,859 | 8 | 68.7 | 12 | 10 | 12 | 0 | 0/0 | 13/13 | 28/28 | 0.306 | 228,990 | 86 |
| go-logstats | with | 2 | 28/28 | 0.274 | 162,320 | 7 | 51.2 | 11 | 10 | 14 | 0 | 0/0 | 13/13 | 28/28 | 0.283 | 193,026 | 54 |
| go-logstats | with | 3 | 28/28 | 0.367 | 203,780 | 9 | 72.3 | 12 | 10 | 12 | 0 | 0/0 | 13/13 | 28/28 | 0.336 | 286,548 | 50 |
| go-logstats | without | 1 | 28/28 | 0.326 | 170,017 | 9 | 62.0 | 5 | 17 | 19 | 2 | 0/0 | 13/13 | 28/28 | 0.347 | 320,057 | 97 |
| go-logstats | without | 2 | 28/28 | 0.268 | 134,945 | 6 | 48.8 | 5 | 18 | 19 | 2 | 0/0 | 13/13 | 28/28 | 0.256 | 157,945 | 46 |
| go-logstats | without | 3 | 28/28 | 0.327 | 141,078 | 7 | 62.0 | 5 | 19 | 19 | 2 | 0/0 | 13/13 | 28/28 | 0.339 | 234,211 | 89 |
| go-pricing | with | 1 | 30/30 | 0.173 | 99,369 | 4 | 24.5 | 7 | 9 | 8 | 0 | 0/0 | 14/14 | 30/30 | 0.259 | 186,203 | 25 |
| go-pricing | with | 2 | 30/30 | 0.170 | 98,949 | 4 | 23.1 | 5 | 14 | 14 | 0 | 0/0 | 14/14 | 30/30 | 0.263 | 181,594 | 26 |
| go-pricing | with | 3 | 30/30 | 0.171 | 99,095 | 4 | 28.7 | 6 | 10 | 9 | 0 | 0/0 | 14/14 | 30/30 | 0.268 | 211,715 | 26 |
| go-pricing | without | 1 | 30/30 | 0.152 | 71,605 | 4 | 21.7 | 1 | 28 | 31 | 1 | 0/0 | 14/14 | 30/30 | 0.264 | 182,802 | 36 |
| go-pricing | without | 2 | 30/30 | 0.155 | 71,772 | 4 | 19.8 | 1 | 28 | 31 | 1 | 0/0 | 14/14 | 30/30 | 0.231 | 154,045 | 36 |
| go-pricing | without | 3 | 30/30 | 0.156 | 71,841 | 4 | 21.1 | 1 | 29 | 32 | 1 | 0/0 | 14/14 | 30/30 | 0.282 | 239,505 | 40 |
| js-markdown | with | 1 | 30/30 | 0.259 | 187,269 | 8 | 49.6 | 14 | 9 | 8 | 0 | 0/0 | 15/15 | 30/30 | 0.250 | 134,556 | 49 |
| js-markdown | with | 2 | 30/30 | 0.282 | 189,377 | 8 | 54.4 | 13 | 7 | 11 | 0 | 0/0 | 15/15 | 30/30 | 0.304 | 305,073 | 69 |
| js-markdown | with | 3 | 30/30 | 0.229 | 128,944 | 5 | 42.5 | 12 | 11 | 8 | 0 | 0/0 | 15/15 | 30/30 | 0.250 | 133,964 | 49 |
| js-markdown | without | 1 | 30/30 | 0.239 | 130,737 | 6 | 40.6 | 11 | 16 | 35 | 1 | 0/0 | 15/15 | 30/30 | 0.307 | 196,225 | 62 |
| js-markdown | without | 2 | 30/30 | 0.278 | 188,082 | 8 | 51.6 | 10 | 16 | 34 | 2 | 0/0 | 15/15 | 30/30 | 0.235 | 132,423 | 26 |
| js-markdown | without | 3 | 30/30 | 0.309 | 273,851 | 11 | 55.1 | 9 | 15 | 34 | 1 | 0/0 | 15/15 | 30/30 | 0.289 | 273,435 | 71 |
| rust-config | with | 1 | 30/30 | 0.386 | 151,495 | 7 | 88.6 | 15 | 10 | – | 0 | 0/0 | 14/14 | 30/30 | 0.347 | 139,510 | 123 |
| rust-config | with | 2 | 30/30 | 0.459 | 229,782 | 9 | 89.3 | 14 | 11 | – | 0 | 1/0 | 14/14 | 30/30 | 0.414 | 314,308 | 142 |
| rust-config | with | 3 | 30/30 | 0.508 | 272,964 | 11 | 97.9 | 14 | 11 | – | 0 | 1/0 | 14/14 | 30/30 | 0.479 | 360,151 | 152 |
| rust-config | without | 1 | 30/30 | 0.362 | 149,050 | 6 | 67.6 | 10 | 19 | – | 2 | 0/0 | 14/14 | 30/30 | 0.419 | 344,704 | 148 |
| rust-config | without | 2 | 30/30 | 0.419 | 188,358 | 8 | 87.0 | 11 | 21 | – | 2 | 0/0 | 14/14 | 30/30 | 0.376 | 207,808 | 184 |
| rust-config | without | 3 | 30/30 | 0.426 | 228,409 | 8 | 80.4 | 8 | 26 | – | 2 | 0/0 | 14/14 | 30/30 | 0.335 | 168,114 | 101 |
| ts-orders | with | 1 | 28/28 | 0.236 | 131,342 | 8 | 39.6 | 15 | 3 | 2 | 0 | 0/0 | 13/13 | 28/28 | 0.392 | 259,410 | 151 |
| ts-orders | with | 2 | 28/28 | 0.335 | 230,081 | 11 | 61.7 | 15 | 7 | 6 | 0 | 1/0 | 13/13 | 28/28 | 0.404 | 210,849 | 137 |
| ts-orders | with | 3 | 28/28 | 0.258 | 187,202 | 9 | 42.1 | 15 | 3 | 2 | 0 | 0/0 | 13/13 | 28/28 | 0.469 | 287,855 | 152 |
| ts-orders | without | 1 | 28/28 | 0.261 | 186,425 | 11 | 49.9 | 5 | 12 | 9 | 1 | 0/0 | 13/13 | 28/28 | 0.378 | 207,174 | 168 |
| ts-orders | without | 2 | 28/28 | 0.279 | 189,329 | 10 | 45.0 | 5 | 18 | 16 | 1 | 0/0 | 13/13 | 28/28 | 0.401 | 261,435 | 149 |
| ts-orders | without | 3 | 28/28 | 0.237 | 130,107 | 8 | 39.1 | 4 | 18 | 16 | 1 | 0/0 | 13/13 | 28/28 | 0.381 | 241,025 | 157 |
| ts-signup | with | 1 | 30/30 | 0.258 | 160,991 | 7 | 42.9 | 15 | 8 | 10 | 0 | 0/0 | 14/14 | 30/30 | 0.268 | 190,426 | 30 |
| ts-signup | with | 2 | 30/30 | 0.321 | 168,594 | 8 | 61.7 | 17 | 8 | 10 | 0 | 0/0 | 14/14 | 30/30 | 0.311 | 231,153 | 34 |
| ts-signup | with | 3 | 30/30 | 0.219 | 102,825 | 4 | 42.8 | 16 | 8 | 8 | 0 | 0/0 | 14/14 | 30/30 | 0.286 | 167,789 | 34 |
| ts-signup | without | 1 | 30/30 | 0.270 | 161,623 | 7 | 48.6 | 15 | 17 | 14 | 1 | 0/0 | 14/14 | 30/30 | 0.250 | 132,348 | 32 |
| ts-signup | without | 2 | 30/30 | 0.293 | 163,597 | 9 | 51.8 | 11 | 26 | 26 | 1 | 0/0 | 14/14 | 30/30 | 0.282 | 223,333 | 34 |
| ts-signup | without | 3 | 30/30 | 0.300 | 163,626 | 8 | 54.2 | 14 | 20 | 15 | 2 | 0/0 | 14/14 | 30/30 | 0.302 | 232,443 | 35 |

## Medians per task (range across the 3 runs)


### go-logstats

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.326 (0.268–0.327) | 0.351 (0.274–0.367) |
| first task tokens | 141,078 (134,945–170,017) | 199,859 (162,320–203,780) |
| first task wall s | 62 (49–62) | 69 (51–72) |
| first task turns | 7 (6–9) | 8 (7–9) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 5 (5–5) | 12 (11–12) |
| worst CCN (lizard) | 18 (17–19) | 10 (10–10) |
| CCN 90th pct (lizard) | 18 (17–19) | 9 (9–10) |
| functions CCN > 10 | 2 (2–2) | 0 (0–0) |
| longest function NLOC | 48 (47–52) | 27 (22–46) |
| worst cognitive (gocognit/SonarJS) | 19 (19–19) | 12 (12–14) |
| functions over Ariadne limits (circular) | 2 (2–2) | 0 (0–0) |
| Ariadne edit blocks | 0 (0–0) | 0 (0–0) |
| Ariadne stop blocks | 0 (0–0) | 0 (0–0) |
| follow-up cost $ | 0.339 (0.256–0.347) | 0.306 (0.283–0.336) |
| follow-up tokens | 234,211 (157,945–320,057) | 228,990 (193,026–286,548) |
| follow-up wall s | 55 (43–57) | 48 (45–56) |
| follow-up turns | 16 (11–17) | 15 (13–18) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 89 (46–97) | 54 (50–86) |

### go-pricing

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.155 (0.152–0.156) | 0.171 (0.170–0.173) |
| first task tokens | 71,772 (71,605–71,841) | 99,095 (98,949–99,369) |
| first task wall s | 21 (20–22) | 24 (23–29) |
| first task turns | 4 (4–4) | 4 (4–4) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 1 (1–1) | 6 (5–7) |
| worst CCN (lizard) | 28 (28–29) | 10 (9–14) |
| CCN 90th pct (lizard) | 28 (28–29) | 10 (9–14) |
| functions CCN > 10 | 1 (1–1) | 0 (0–1) |
| longest function NLOC | 73 (73–75) | 36 (24–44) |
| worst cognitive (gocognit/SonarJS) | 31 (31–32) | 9 (8–14) |
| functions over Ariadne limits (circular) | 1 (1–1) | 0 (0–0) |
| Ariadne edit blocks | 0 (0–0) | 0 (0–0) |
| Ariadne stop blocks | 0 (0–0) | 0 (0–0) |
| follow-up cost $ | 0.264 (0.231–0.282) | 0.263 (0.259–0.268) |
| follow-up tokens | 182,802 (154,045–239,505) | 186,203 (181,594–211,715) |
| follow-up wall s | 42 (36–49) | 44 (41–44) |
| follow-up turns | 13 (12–13) | 13 (13–15) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 36 (36–40) | 26 (25–26) |

### js-markdown

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.278 (0.239–0.309) | 0.259 (0.229–0.282) |
| first task tokens | 188,082 (130,737–273,851) | 187,269 (128,944–189,377) |
| first task wall s | 52 (41–55) | 50 (42–54) |
| first task turns | 8 (6–11) | 8 (5–8) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 10 (9–11) | 13 (12–14) |
| worst CCN (lizard) | 16 (15–16) | 9 (7–11) |
| CCN 90th pct (lizard) | 7 (6–15) | 6 (6–9) |
| functions CCN > 10 | 1 (1–1) | 0 (0–1) |
| longest function NLOC | 57 (56–57) | 19 (17–23) |
| worst cognitive (gocognit/SonarJS) | 34 (34–35) | 8 (8–11) |
| functions over Ariadne limits (circular) | 1 (1–2) | 0 (0–0) |
| Ariadne edit blocks | 0 (0–0) | 0 (0–0) |
| Ariadne stop blocks | 0 (0–0) | 0 (0–0) |
| follow-up cost $ | 0.289 (0.235–0.307) | 0.250 (0.250–0.304) |
| follow-up tokens | 196,225 (132,423–273,435) | 134,556 (133,964–305,073) |
| follow-up wall s | 46 (37–51) | 41 (38–49) |
| follow-up turns | 12 (8–13) | 8 (8–14) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 62 (26–71) | 49 (49–69) |

### rust-config

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.419 (0.362–0.426) | 0.459 (0.386–0.508) |
| first task tokens | 188,358 (149,050–228,409) | 229,782 (151,495–272,964) |
| first task wall s | 80 (68–87) | 89 (89–98) |
| first task turns | 8 (6–8) | 9 (7–11) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 10 (8–11) | 14 (14–15) |
| worst CCN (lizard) | 21 (19–26) | 11 (10–11) |
| CCN 90th pct (lizard) | 8 (5–26) | 8 (7–8) |
| functions CCN > 10 | 1 (1–1) | 1 (0–1) |
| longest function NLOC | 65 (63–72) | 26 (25–28) |
| worst cognitive (gocognit/SonarJS) | – | – |
| functions over Ariadne limits (circular) | 2 (2–2) | 0 (0–0) |
| Ariadne edit blocks | 0 (0–0) | 1 (0–1) |
| Ariadne stop blocks | 0 (0–0) | 0 (0–0) |
| follow-up cost $ | 0.376 (0.335–0.419) | 0.414 (0.347–0.479) |
| follow-up tokens | 207,808 (168,114–344,704) | 314,308 (139,510–360,151) |
| follow-up wall s | 71 (68–77) | 73 (60–106) |
| follow-up turns | 14 (13–18) | 16 (11–22) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 148 (101–184) | 142 (123–152) |

### ts-orders

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.261 (0.237–0.279) | 0.258 (0.236–0.335) |
| first task tokens | 186,425 (130,107–189,329) | 187,202 (131,342–230,081) |
| first task wall s | 45 (39–50) | 42 (40–62) |
| first task turns | 10 (8–11) | 9 (8–11) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 5 (4–5) | 15 (15–15) |
| worst CCN (lizard) | 18 (12–18) | 3 (3–7) |
| CCN 90th pct (lizard) | 18 (12–18) | 3 (3–3) |
| functions CCN > 10 | 1 (1–1) | 0 (0–0) |
| longest function NLOC | 58 (52–64) | 16 (16–16) |
| worst cognitive (gocognit/SonarJS) | 16 (9–16) | 2 (2–6) |
| functions over Ariadne limits (circular) | 1 (1–1) | 0 (0–0) |
| Ariadne edit blocks | 0 (0–0) | 0 (0–1) |
| Ariadne stop blocks | 0 (0–0) | 0 (0–0) |
| follow-up cost $ | 0.381 (0.378–0.401) | 0.404 (0.392–0.469) |
| follow-up tokens | 241,025 (207,174–261,435) | 259,410 (210,849–287,855) |
| follow-up wall s | 72 (70–80) | 72 (69–87) |
| follow-up turns | 13 (13–16) | 15 (14–15) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 157 (149–168) | 151 (137–152) |

### ts-signup

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.293 (0.270–0.300) | 0.258 (0.219–0.321) |
| first task tokens | 163,597 (161,623–163,626) | 160,991 (102,825–168,594) |
| first task wall s | 52 (49–54) | 43 (43–62) |
| first task turns | 8 (7–9) | 7 (4–8) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 14 (11–15) | 16 (15–17) |
| worst CCN (lizard) | 20 (17–26) | 8 (8–8) |
| CCN 90th pct (lizard) | 9 (9–14) | 6 (6–8) |
| functions CCN > 10 | 1 (1–2) | 0 (0–0) |
| longest function NLOC | 25 (18–62) | 11 (10–18) |
| worst cognitive (gocognit/SonarJS) | 15 (14–26) | 10 (8–10) |
| functions over Ariadne limits (circular) | 1 (1–2) | 0 (0–0) |
| Ariadne edit blocks | 0 (0–0) | 0 (0–0) |
| Ariadne stop blocks | 0 (0–0) | 0 (0–0) |
| follow-up cost $ | 0.282 (0.250–0.302) | 0.286 (0.268–0.311) |
| follow-up tokens | 223,333 (132,348–232,443) | 190,426 (167,789–231,153) |
| follow-up wall s | 42 (40–56) | 44 (42–47) |
| follow-up turns | 12 (11–14) | 14 (14–14) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 34 (32–35) | 34 (30–34) |

## All tasks together (medians of all 18 runs per arm)

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.278 (0.152–0.426) | 0.267 (0.170–0.508) |
| first task tokens | 162,610 (71,605–273,851) | 165,457 (98,949–272,964) |
| first task wall s | 51 (20–87) | 50 (23–98) |
| first task turns | 8.000 (4.000–11.000) | 8.000 (4.000–11.000) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 6.500 (1.000–15.000) | 14 (5–17) |
| worst CCN (lizard) | 18 (12–29) | 9.500 (3.000–14.000) |
| CCN 90th pct (lizard) | 16 (5–29) | 8.000 (3.000–14.000) |
| functions CCN > 10 | 1.000 (1.000–2.000) | 0.000 (0.000–1.000) |
| longest function NLOC | 58 (18–75) | 22 (10–46) |
| worst cognitive (gocognit/SonarJS) | 19 (9–35) | 9 (2–14) |
| functions over Ariadne limits (circular) | 1.000 (1.000–2.000) | 0.000 (0.000–0.000) |
| Ariadne edit blocks | 0.000 (0.000–0.000) | 0.000 (0.000–1.000) |
| Ariadne stop blocks | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) |
| follow-up cost $ | 0.304 (0.231–0.419) | 0.305 (0.250–0.479) |
| follow-up tokens | 215,570 (132,348–344,704) | 211,282 (133,964–360,151) |
| follow-up wall s | 53 (36–80) | 47 (38–106) |
| follow-up turns | 13 (8–18) | 14 (8–22) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 66 (26–184) | 52 (25–152) |

Total spend: without 10.73 $, with 11.14 $ (first task + follow-up).

## Blind judging

| task | rep | order 1 | order 2 | counted |
|---|---|---|---|---|
| go-logstats | 1 | with | with | **with** |
| go-logstats | 2 | with | with | **with** |
| go-logstats | 3 | with | with | **with** |
| go-pricing | 1 | with | with | **with** |
| go-pricing | 2 | with | with | **with** |
| go-pricing | 3 | with | with | **with** |
| js-markdown | 1 | with | with | **with** |
| js-markdown | 2 | with | with | **with** |
| js-markdown | 3 | with | with | **with** |
| rust-config | 1 | with | with | **with** |
| rust-config | 2 | with | with | **with** |
| rust-config | 3 | with | with | **with** |
| ts-orders | 1 | with | with | **with** |
| ts-orders | 2 | without | without | **without** |
| ts-orders | 3 | with | with | **with** |
| ts-signup | 1 | with | with | **with** |
| ts-signup | 2 | with | with | **with** |
| ts-signup | 3 | with | with | **with** |

Preferred: with Ariadne 17, without 1, no agreement/tie 0 (of 18 pairs).

Reasons given:

- go-logstats rep 1, A=with, B=without: A — Version A splits parsing and summarising into small, single-purpose, independently testable helpers (parsePath, parseStatus, p95, topPaths, timeBounds), whereas B packs all aggregation into one long Analyze and all field validation into one long parseLine, making each harder to read and change safely.
- go-logstats rep 1, A=without, B=with: B — Version B separates parsing from summarizing and splits each field and statistic into a small, independently testable, well-named helper, whereas Version A mixes parsing, aggregation, sorting and percentile logic into one long Analyze loop.
- go-logstats rep 2, A=with, B=without: A — A splits parsing and statistics into small, individually testable helpers (parsePath, parseStatus, topPaths, p95) with clear contracts, while B packs the same logic into two long functions where field validation and aggregation are interleaved and harder to change in isolation.
- go-logstats rep 2, A=without, B=with: B — Version B splits parsing into small per-field functions and separates line parsing from aggregation with named helpers like topPaths and p95, so each piece can be read, tested, and changed in isolation, whereas Version A packs everything into two long functions.
- go-logstats rep 3, A=with, B=without: A — Version A splits parsing and each statistic into small, independently readable and testable helpers, while B packs all aggregation into one long Analyze loop and hand-rolls field splitting in a monolithic parseLine.
- go-logstats rep 3, A=without, B=with: B — Version B splits parsing and each statistic into small, independently readable and testable helpers with documented preconditions, whereas Version A interleaves all accumulation into one loop and hand-rolls field splitting, making changes riskier.
- go-pricing rep 1, A=without, B=with: B — B splits the pricing pipeline into small named steps (validate, discountedAmount, applyCoupon, shippingCost) that document the discount order and can each be read, tested and changed in isolation, whereas A interleaves subtotal, member discount, quantity and weight in one loop and keeps all rules in a single long function.
- go-pricing rep 1, A=with, B=without: A — Version A names each pricing rule (validate, memberDiscount, applyCoupon, shippingCost) so each can be read, tested and changed in isolation, whereas Version B folds everything into one ~90-line Quote where a change to one rule risks touching the shared loop and intermediate variables.
- go-pricing rep 2, A=with, B=without: A — Version A splits each pricing rule into a small, named, independently testable helper (member discount, coupon, shipping) and documents the region rate fields, whereas Version B folds everything into one long Quote function where unrelated rules are interleaved in a single loop.
- go-pricing rep 2, A=without, B=with: B — Version B splits the monolithic Quote into small, named, documented helpers (countedItems, memberDiscount, applyCoupon, shippingCost) and a knownCoupons table, so each rule can be read, tested, and changed in isolation while remaining behaviorally identical to A.
- go-pricing rep 3, A=with, B=without: A — Version A breaks the same logic into small named helpers (validate, memberDiscount, applyCoupon, shippingCost) so Quote reads as a sequence of pricing steps and each rule can be changed and tested in isolation, whereas Version B is one long function where every rule is inlined.
- go-pricing rep 3, A=without, B=with: B — B splits the same logic into small named helpers (validate, memberDiscount, applyCoupon, shippingCost) so each rule can be read, tested, and changed in isolation, while A packs everything into one long function.
- js-markdown rep 1, A=without, B=with: B — B splits inline parsing into small single-purpose try* functions with a flat matchAt dispatcher and separates block grouping from rendering, so adding or changing a rule touches one obvious place, whereas A's renderInline is one long loop of nested conditionals with duplicated advance/continue logic; B's only wart is heading blocks using `text` while others use `lines`.
- js-markdown rep 1, A=with, B=without: A — A splits inline parsing into small single-purpose functions (tryCode, tryWrapped, tryLink, matchAt) with an explicit nesting-level rule, so adding or changing a rule is a local edit, whereas B's single long renderInline loop with nested ifs and the inline block-grouping in render spread the same logic across more state to track.
- js-markdown rep 2, A=with, B=without: A — A splits inline parsing into small named matcher functions driven by a rules list and renders blocks from plain data, so adding or changing a rule is a local edit, whereas B packs all inline logic into one long loop with numeric level flags and interleaves block rendering with the parsing loop via a closure.
- js-markdown rep 2, A=without, B=with: B — Version B splits inline parsing into small per-rule functions driven by a readable rule list with named options, and separates block accumulation from block rendering, whereas A packs everything into one long loop keyed on opaque numeric level constants.
- js-markdown rep 3, A=without, B=with: B — B splits inline parsing into small single-purpose functions (parseAt/parseLink/parseEmphasis) with a trivial driver loop, so adding or changing a rule is localized, whereas A packs everything into one long loop with manual literal-buffer flushing that is easier to get wrong when edited.
- js-markdown rep 3, A=with, B=without: A — A splits inline parsing into small single-purpose functions (parseAt, parseLink, parseEmphasis) with a trivial driver loop, so each rule can be read and changed in isolation, whereas B packs all rules, the literal-buffer flushing, and nested fallthrough conditions into one long renderInline that is harder to reason about safely.
- rust-config rep 1, A=without, B=with: B — B splits the monolithic parse into small, well-named functions (parse_text, apply_env, parse_header, parse_assignment, parse_list, parse_escape), replacing A's inlined env-override loop with its awkward memoized `parsed.clone().unwrap()` with a clear two-phase lookup and making each piece easier to test and change in isolation.
- rust-config rep 1, A=with, B=without: A — Version A splits parsing, header/assignment validation, and env overrides into small named functions with no unwraps, while Version B packs line parsing, a triple-nested env override loop with a `parsed.clone().unwrap()`, and required-key checks into one long `parse` function that is harder to read and change safely.
- rust-config rep 2, A=with, B=without: A — Version A decomposes parsing into small single-purpose functions (header, assignment, list, env overrides) with no expect() calls, so each piece can be read and changed in isolation, whereas B's parse inlines three phases into one long function despite its nicer micro-helpers.
- rust-config rep 2, A=without, B=with: B — Version B splits parsing into small, single-purpose functions (read_text, parse_header, parse_assignment, parse_list, unescape, apply_env) and its env override collects targets then assigns, whereas Version A packs line parsing and a nested env loop with an awkward lazily-parsed Option into one long function.
- rust-config rep 3, A=without, B=with: B — Version B splits the monolithic parse into small, named, documented functions (parse_text, parse_header, parse_assignment, parse_list, unescape, apply_env) with clearer control flow and no clone/unwrap tricks, making each piece easier to read, test and change in isolation.
- rust-config rep 3, A=with, B=without: A — Version A breaks parsing into small, documented single-purpose functions (parse_text, parse_header, parse_assignment, apply_env, unescape) instead of Version B's one long parse function, making each piece easier to read, test, and change in isolation.
- ts-orders rep 1, A=without, B=with: B — Version B keeps each event's preconditions and resulting changes together in one typed handler, so adding or changing an event touches one place, whereas A splits the rules between a transition table, a special-cased refund branch, and a switch that mutates a copy.
- ts-orders rep 1, A=with, B=without: A — Each event's state guard, validation, and resulting changes live together in one typed handler that the mapped type forces to be exhaustive, whereas B scatters the rules across a lookup table, a special-cased refund branch in checkTransition, and a mutating switch with no exhaustiveness check.
- ts-orders rep 2, A=with, B=without: B — B's single switch with native discriminated-union narrowing is more direct and fully type-safe, whereas A's handler map needs the EventOf/Handlers type gymnastics plus an unsafe cast in apply and spreads loosely-typed Partial<Order> results, adding indirection without a real gain for seven small cases.
- ts-orders rep 2, A=without, B=with: A — Version A's single linear switch is easier to follow than B's handler map, which adds a mapped-type helper, an unsafe cast in apply, and indirection for only seven cases, without a meaningful gain in safety.
- ts-orders rep 3, A=without, B=with: B — Version B keeps each event's state guard, validation, and resulting changes together in one typed handler, so adding or changing an event touches one place and the Handlers mapped type enforces exhaustiveness, whereas Version A splits the rules across an ALLOWED_FROM table, a special-cased refund branch, and a switch that must all stay in sync.
- ts-orders rep 3, A=with, B=without: A — Version A keeps each event's guard, validation and state changes together in one typed handler, whereas B splits the same logic across a lookup table with a carved-out refund special case and a separate switch, so adding or changing an event means editing multiple places.
- ts-signup rep 1, A=with, B=without: A — A factors validation into small named helpers and constants (isValidLocalPart, isValidDomain, ageOn, named regexes) and passes already-validated values as optionals, whereas B inlines regexes, writes a long monolithic isValidEmail, and threads value-plus-boolean pairs (country/countryOk, email/emailOk) that are easier to misuse.
- ts-signup rep 1, A=without, B=with: B — B replaces A's paired value-plus-boolean parameters (email/emailOk, country/countryOk) with optional values, names its regexes, and extracts small focused helpers like ageOn and isValidDomain, so each rule is easier to locate and change in isolation.
- ts-signup rep 2, A=with, B=without: A — A isolates each field's rules in a small, independently testable validator and assembles results in one readable table, whereas B packs everything into one long function with redundant str() coercions of already-typed fields and a regex that captures digits individually just to feed the checksum.
- ts-signup rep 2, A=without, B=with: B — B splits each field into a small, independently testable validator returning an error code, so rules are easy to locate and change in isolation, while A's single long function interleaves field logic and shared state (localPart, countryValid) that must be traced through the whole body.
- ts-signup rep 3, A=with, B=without: A — Version A composes small, single-purpose helpers with named regexes and a parseDate that returns undefined on invalid input, while Version B adds noisy runtime type-guards on an already-typed form, inlines its regexes, and scatters the same validation logic across longer imperative blocks.
- ts-signup rep 3, A=without, B=with: B — Version B trusts the declared types instead of re-checking them with `str()`, names every regex, and splits email/date/age logic into small single-purpose helpers, so each rule is easier to find and change than in A's longer inline functions.
