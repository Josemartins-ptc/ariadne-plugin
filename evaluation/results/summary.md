## Raw runs

| task | arm | rep | hidden | cost $ | tokens | turns | wall s | functions | CCN max | cognitive max | Ariadne over | edit/stop blocks | follow-up hidden | first tests after | follow-up cost $ | follow-up tokens | lines changed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| go-logstats | with | 1 | 28/28 | 0.202 | 184,507 | 8 | 59.0 | 13 | 10 | 13 | 0 | 1/0 | 13/13 | 28/28 | 0.107 | 104,099 | 49 |
| go-logstats | with | 2 | 28/28 | 0.209 | 186,519 | 8 | 56.2 | 14 | 10 | 13 | 0 | 1/0 | 13/13 | 28/28 | 0.113 | 134,651 | 59 |
| go-logstats | with | 3 | 28/28 | 0.217 | 252,049 | 10 | 61.2 | 14 | 11 | 10 | 0 | 1/0 | 13/13 | 28/28 | 0.116 | 134,980 | 49 |
| go-logstats | without | 1 | 28/28 | 0.128 | 107,743 | 5 | 31.0 | 5 | 18 | 19 | 2 | 0/0 | 13/13 | 28/28 | 0.100 | 102,131 | 38 |
| go-logstats | without | 2 | 28/28 | 0.120 | 105,798 | 5 | 28.3 | 5 | 28 | 41 | 1 | 0/0 | 13/13 | 28/28 | 0.122 | 133,710 | 37 |
| go-logstats | without | 3 | 28/28 | 0.128 | 107,487 | 5 | 31.6 | 4 | 27 | 37 | 2 | 0/0 | 13/13 | 28/28 | 0.118 | 133,495 | 40 |
| go-pricing | with | 1 | 30/30 | 0.127 | 137,048 | 8 | 30.3 | 6 | 8 | 8 | 0 | 1/0 | 14/14 | 30/30 | 0.096 | 126,121 | 23 |
| go-pricing | with | 2 | 30/30 | 0.075 | 73,373 | 4 | 13.9 | 4 | 12 | 13 | 0 | 0/0 | 14/14 | 30/30 | 0.102 | 153,885 | 23 |
| go-pricing | with | 3 | 30/30 | 0.075 | 73,404 | 4 | 13.8 | 4 | 12 | 13 | 0 | 0/0 | 14/14 | 30/30 | 0.096 | 125,736 | 26 |
| go-pricing | without | 1 | 30/30 | 0.077 | 98,457 | 5 | 14.5 | 1 | 28 | 31 | 1 | 0/0 | 14/14 | 30/30 | 0.101 | 151,445 | 24 |
| go-pricing | without | 2 | 30/30 | 0.095 | 102,199 | 5 | 17.3 | 1 | 28 | 31 | 1 | 0/0 | 14/14 | 30/30 | 0.093 | 123,543 | 27 |
| go-pricing | without | 3 | 30/30 | 0.072 | 72,254 | 4 | 12.4 | 1 | 28 | 31 | 1 | 0/0 | 14/14 | 30/30 | 0.098 | 125,757 | 27 |
| js-markdown | with | 1 | 30/30 | 0.163 | 227,274 | 11 | 43.2 | 14 | 7 | 8 | 0 | 1/0 | 15/15 | 30/30 | 0.103 | 131,104 | 23 |
| js-markdown | with | 2 | 30/30 | 0.179 | 256,023 | 11 | 47.5 | 16 | 7 | 8 | 0 | 1/0 | 15/15 | 30/30 | 0.108 | 159,394 | 22 |
| js-markdown | with | 3 | 30/30 | 0.184 | 292,754 | 12 | 50.2 | 14 | 6 | 7 | 0 | 1/0 | 15/15 | 30/30 | 0.116 | 162,025 | 28 |
| js-markdown | without | 1 | 30/30 | 0.120 | 155,191 | 7 | 28.3 | 10 | 16 | 30 | 2 | 0/0 | 15/15 | 30/30 | 0.102 | 155,062 | 23 |
| js-markdown | without | 2 | 30/30 | 0.078 | 72,715 | 4 | 17.2 | 10 | 17 | 31 | 2 | 0/0 | 15/15 | 30/30 | 0.103 | 157,021 | 27 |
| js-markdown | without | 3 | 30/30 | 0.085 | 73,847 | 4 | 21.3 | 9 | 17 | 39 | 1 | 0/0 | 15/15 | 30/30 | 0.096 | 126,661 | 24 |
| rust-config | with | 1 | 30/30 | 0.318 | 455,619 | 17 | 91.9 | 14 | 8 | – | 0 | 2/0 | 14/14 | 30/30 | 0.116 | 107,122 | 47 |
| rust-config | with | 2 | 30/30 | 0.226 | 194,800 | 8 | 68.2 | 15 | 9 | – | 0 | 1/0 | 14/14 | 30/30 | 0.153 | 233,598 | 75 |
| rust-config | with | 3 | 30/30 | 0.253 | 235,865 | 10 | 72.1 | 15 | 9 | – | 0 | 2/0 | 14/14 | 30/30 | 0.178 | 242,300 | 60 |
| rust-config | without | 1 | 30/30 | 0.156 | 114,502 | 5 | 42.2 | 7 | 26 | – | 3 | 0/0 | 14/14 | 30/30 | 0.127 | 163,739 | 39 |
| rust-config | without | 2 | 30/30 | 0.165 | 116,386 | 5 | 45.6 | 9 | 24 | – | 2 | 0/0 | 14/14 | 30/30 | 0.137 | 166,320 | 74 |
| rust-config | without | 3 | 30/30 | 0.164 | 116,058 | 5 | 47.3 | 9 | 27 | – | 2 | 0/0 | 14/14 | 30/30 | 0.123 | 161,161 | 44 |
| ts-orders | with | 1 | 28/28 | 0.147 | 195,152 | 10 | 38.8 | 8 | 9 | 5 | 0 | 1/0 | 13/13 | 28/28 | 0.173 | 179,437 | 125 |
| ts-orders | with | 2 | 28/28 | 0.137 | 192,660 | 9 | 32.8 | 12 | 7 | 6 | 0 | 1/0 | 13/13 | 28/28 | 0.158 | 144,478 | 120 |
| ts-orders | with | 3 | 28/28 | 0.130 | 162,916 | 9 | 30.8 | 8 | 8 | 6 | 0 | 1/0 | 13/13 | 28/28 | 0.172 | 179,273 | 128 |
| ts-orders | without | 1 | 28/28 | 0.073 | 70,984 | 4 | 13.4 | 4 | 28 | 29 | 1 | 0/0 | 13/13 | 28/28 | 0.163 | 174,222 | 125 |
| ts-orders | without | 2 | 28/28 | 0.072 | 70,883 | 4 | 12.6 | 4 | 18 | 25 | 1 | 0/0 | 13/13 | 28/28 | 0.159 | 175,097 | 123 |
| ts-orders | without | 3 | 28/28 | 0.072 | 70,882 | 4 | 13.1 | 4 | 18 | 25 | 1 | 0/0 | 13/13 | 28/28 | 0.191 | 182,320 | 134 |
| ts-signup | with | 1 | 30/30 | 0.211 | 288,216 | 12 | 54.9 | 15 | 8 | 8 | 0 | 2/0 | 14/14 | 30/30 | 0.100 | 129,118 | 26 |
| ts-signup | with | 2 | 30/30 | 0.151 | 139,712 | 7 | 39.1 | 15 | 9 | 7 | 0 | 1/0 | 14/14 | 30/30 | 0.101 | 101,843 | 38 |
| ts-signup | with | 3 | 30/30 | 0.209 | 257,112 | 11 | 52.1 | 14 | 9 | 8 | 0 | 2/0 | 14/14 | 30/30 | 0.096 | 100,648 | 31 |
| ts-signup | without | 1 | 30/30 | 0.126 | 106,686 | 5 | 29.4 | 4 | 41 | 42 | 2 | 0/0 | 14/14 | 30/30 | 0.078 | 97,440 | 24 |
| ts-signup | without | 2 | 30/30 | 0.124 | 106,225 | 5 | 29.1 | 5 | 36 | 40 | 2 | 0/0 | 14/14 | 30/30 | 0.101 | 101,032 | 28 |
| ts-signup | without | 3 | 30/30 | 0.086 | 72,898 | 4 | 18.1 | 4 | 21 | 24 | 3 | 0/0 | 14/14 | 30/30 | 0.102 | 101,576 | 37 |

## Medians per task (range across the 3 runs)


### go-logstats

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.128 (0.120–0.128) | 0.209 (0.202–0.217) |
| first task tokens | 107,487 (105,798–107,743) | 186,519 (184,507–252,049) |
| first task wall s | 31 (28–32) | 59 (56–61) |
| first task turns | 5 (5–5) | 8 (8–10) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 5 (4–5) | 14 (13–14) |
| worst CCN (lizard) | 27 (18–28) | 10 (10–11) |
| CCN 90th pct (lizard) | 27 (18–28) | 9 (8–9) |
| functions CCN > 10 | 2 (1–2) | 0 (0–1) |
| longest function NLOC | 74 (54–84) | 25 (25–26) |
| worst cognitive (gocognit/SonarJS) | 37 (19–41) | 13 (10–13) |
| functions over Ariadne limits (circular) | 2 (1–2) | 0 (0–0) |
| Ariadne edit blocks | 0 (0–0) | 1 (1–1) |
| Ariadne stop blocks | 0 (0–0) | 0 (0–0) |
| follow-up cost $ | 0.118 (0.100–0.122) | 0.113 (0.107–0.116) |
| follow-up tokens | 133,495 (102,131–133,710) | 134,651 (104,099–134,980) |
| follow-up wall s | 26 (21–29) | 24 (22–25) |
| follow-up turns | 8 (8–13) | 9 (8–9) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 38 (37–40) | 49 (49–59) |

### go-pricing

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.077 (0.072–0.095) | 0.075 (0.075–0.127) |
| first task tokens | 98,457 (72,254–102,199) | 73,404 (73,373–137,048) |
| first task wall s | 14 (12–17) | 14 (14–30) |
| first task turns | 5 (4–5) | 4 (4–8) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 1 (1–1) | 4 (4–6) |
| worst CCN (lizard) | 28 (28–28) | 12 (8–12) |
| CCN 90th pct (lizard) | 28 (28–28) | 12 (8–12) |
| functions CCN > 10 | 1 (1–1) | 1 (0–1) |
| longest function NLOC | 78 (78–79) | 41 (41–42) |
| worst cognitive (gocognit/SonarJS) | 31 (31–31) | 13 (8–13) |
| functions over Ariadne limits (circular) | 1 (1–1) | 0 (0–0) |
| Ariadne edit blocks | 0 (0–0) | 0 (0–1) |
| Ariadne stop blocks | 0 (0–0) | 0 (0–0) |
| follow-up cost $ | 0.098 (0.093–0.101) | 0.096 (0.096–0.102) |
| follow-up tokens | 125,757 (123,543–151,445) | 126,121 (125,736–153,885) |
| follow-up wall s | 21 (20–22) | 20 (20–21) |
| follow-up turns | 10 (10–11) | 10 (10–11) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 27 (24–27) | 23 (23–26) |

### js-markdown

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.085 (0.078–0.120) | 0.179 (0.163–0.184) |
| first task tokens | 73,847 (72,715–155,191) | 256,023 (227,274–292,754) |
| first task wall s | 21 (17–28) | 48 (43–50) |
| first task turns | 4 (4–7) | 11 (11–12) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 10 (9–10) | 14 (14–16) |
| worst CCN (lizard) | 17 (16–17) | 7 (6–7) |
| CCN 90th pct (lizard) | 6 (5–17) | 6 (6–6) |
| functions CCN > 10 | 1 (1–1) | 0 (0–0) |
| longest function NLOC | 51 (49–52) | 25 (23–25) |
| worst cognitive (gocognit/SonarJS) | 31 (30–39) | 8 (7–8) |
| functions over Ariadne limits (circular) | 2 (1–2) | 0 (0–0) |
| Ariadne edit blocks | 0 (0–0) | 1 (1–1) |
| Ariadne stop blocks | 0 (0–0) | 0 (0–0) |
| follow-up cost $ | 0.102 (0.096–0.103) | 0.108 (0.103–0.116) |
| follow-up tokens | 155,062 (126,661–157,021) | 159,394 (131,104–162,025) |
| follow-up wall s | 22 (21–24) | 24 (24–26) |
| follow-up turns | 8 (7–9) | 8 (8–10) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 24 (23–27) | 23 (22–28) |

### rust-config

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.164 (0.156–0.165) | 0.253 (0.226–0.318) |
| first task tokens | 116,058 (114,502–116,386) | 235,865 (194,800–455,619) |
| first task wall s | 46 (42–47) | 72 (68–92) |
| first task turns | 5 (5–5) | 10 (8–17) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 9 (7–9) | 15 (14–15) |
| worst CCN (lizard) | 26 (24–27) | 9 (8–9) |
| CCN 90th pct (lizard) | 26 (24–27) | 8 (6–8) |
| functions CCN > 10 | 1 (1–2) | 0 (0–0) |
| longest function NLOC | 68 (68–78) | 24 (24–24) |
| worst cognitive (gocognit/SonarJS) | – | – |
| functions over Ariadne limits (circular) | 2 (2–3) | 0 (0–0) |
| Ariadne edit blocks | 0 (0–0) | 2 (1–2) |
| Ariadne stop blocks | 0 (0–0) | 0 (0–0) |
| follow-up cost $ | 0.127 (0.123–0.137) | 0.153 (0.116–0.178) |
| follow-up tokens | 163,739 (161,161–166,320) | 233,598 (107,122–242,300) |
| follow-up wall s | 31 (27–36) | 41 (27–47) |
| follow-up turns | 11 (9–11) | 12 (9–14) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 44 (39–74) | 60 (47–75) |

### ts-orders

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.072 (0.072–0.073) | 0.137 (0.130–0.147) |
| first task tokens | 70,883 (70,882–70,984) | 192,660 (162,916–195,152) |
| first task wall s | 13 (13–13) | 33 (31–39) |
| first task turns | 4 (4–4) | 9 (9–10) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 4 (4–4) | 8 (8–12) |
| worst CCN (lizard) | 18 (18–28) | 8 (7–9) |
| CCN 90th pct (lizard) | 18 (18–28) | 8 (2–9) |
| functions CCN > 10 | 1 (1–1) | 0 (0–0) |
| longest function NLOC | 74 (74–76) | 22 (21–25) |
| worst cognitive (gocognit/SonarJS) | 25 (25–29) | 6 (5–6) |
| functions over Ariadne limits (circular) | 1 (1–1) | 0 (0–0) |
| Ariadne edit blocks | 0 (0–0) | 1 (1–1) |
| Ariadne stop blocks | 0 (0–0) | 0 (0–0) |
| follow-up cost $ | 0.163 (0.159–0.191) | 0.172 (0.158–0.173) |
| follow-up tokens | 175,097 (174,222–182,320) | 179,273 (144,478–179,437) |
| follow-up wall s | 40 (38–48) | 43 (38–43) |
| follow-up turns | 13 (12–14) | 13 (13–13) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 125 (123–134) | 125 (120–128) |

### ts-signup

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.124 (0.086–0.126) | 0.209 (0.151–0.211) |
| first task tokens | 106,225 (72,898–106,686) | 257,112 (139,712–288,216) |
| first task wall s | 29 (18–29) | 52 (39–55) |
| first task turns | 5 (4–5) | 11 (7–12) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 4 (4–5) | 15 (14–15) |
| worst CCN (lizard) | 36 (21–41) | 9 (8–9) |
| CCN 90th pct (lizard) | 36 (21–41) | 7 (7–8) |
| functions CCN > 10 | 2 (2–3) | 0 (0–0) |
| longest function NLOC | 45 (36–66) | 17 (17–17) |
| worst cognitive (gocognit/SonarJS) | 40 (24–42) | 8 (7–8) |
| functions over Ariadne limits (circular) | 2 (2–3) | 0 (0–0) |
| Ariadne edit blocks | 0 (0–0) | 2 (1–2) |
| Ariadne stop blocks | 0 (0–0) | 0 (0–0) |
| follow-up cost $ | 0.101 (0.078–0.102) | 0.100 (0.096–0.101) |
| follow-up tokens | 101,032 (97,440–101,576) | 101,843 (100,648–129,118) |
| follow-up wall s | 21 (18–21) | 19 (18–21) |
| follow-up turns | 8 (7–10) | 9 (9–9) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 28 (24–37) | 31 (26–38) |

## All tasks together (medians of all 18 runs per arm)

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.107 (0.072–0.165) | 0.181 (0.075–0.318) |
| first task tokens | 103,998 (70,882–155,191) | 194,976 (73,373–455,619) |
| first task wall s | 25 (12–47) | 49 (14–92) |
| first task turns | 5.000 (4.000–7.000) | 9.500 (4.000–17.000) |
| hidden tests passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| functions | 4.500 (1.000–10.000) | 14 (4–16) |
| worst CCN (lizard) | 26 (16–41) | 9.000 (6.000–12.000) |
| CCN 90th pct (lizard) | 26 (5–41) | 8.000 (2.000–12.000) |
| functions CCN > 10 | 1.000 (1.000–3.000) | 0.000 (0.000–1.000) |
| longest function NLOC | 71 (36–84) | 24 (17–42) |
| worst cognitive (gocognit/SonarJS) | 31 (19–42) | 8 (5–13) |
| functions over Ariadne limits (circular) | 2.000 (1.000–3.000) | 0.000 (0.000–0.000) |
| Ariadne edit blocks | 0.000 (0.000–0.000) | 1.000 (0.000–2.000) |
| Ariadne stop blocks | 0.000 (0.000–0.000) | 0.000 (0.000–0.000) |
| follow-up cost $ | 0.103 (0.078–0.191) | 0.111 (0.096–0.178) |
| follow-up tokens | 142,578 (97,440–182,320) | 134,816 (100,648–242,300) |
| follow-up wall s | 23 (18–48) | 24 (18–47) |
| follow-up turns | 10 (7–14) | 9.500 (8.000–14.000) |
| follow-up hidden passed (share) | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| first-task tests still passing after follow-up | 1.000 (1.000–1.000) | 1.000 (1.000–1.000) |
| follow-up lines changed | 37 (23–134) | 42 (22–128) |

Total spend: without 4.05 $, with 5.42 $ (first task + follow-up).

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

- go-logstats rep 1, A=with, B=without: A — Version A splits parsing and aggregation into small, well-named helpers (parsePath, parseStatus, parseLatency, acc.add, topPaths, p95), so each rule can be read, tested and changed on its own, while Version B packs field splitting, validation and aggregation into two long functions.
- go-logstats rep 1, A=without, B=with: B — B splits parsing into small named validators (parsePath, parseStatus, parseLatency) and moves aggregation into an accumulator with focused methods, so each rule can be read, tested and changed on its own, whereas A packs field splitting, validation and aggregation into two long functions.
- go-logstats rep 2, A=with, B=without: A — Version A breaks parsing into small, named, single-purpose functions (splitFields, parsePath, parseStatus, parseLatency) and separates accumulation from parsing, whereas Version B packs all validation and aggregation into one long Analyze loop with repeated bad()/continue boilerplate, making it harder to read and change safely.
- go-logstats rep 2, A=without, B=with: B — B breaks parsing into small, named, single-purpose functions (splitFields, parsePath, parseStatus, parseLatency, topPaths, p95) and separates parsing from accumulation, so each rule can be read, tested and changed in isolation, whereas A packs all validation and aggregation into one long loop with repeated bad()/continue branches.
- go-logstats rep 3, A=with, B=without: A — Version A splits parsing and aggregation into small, named, single-purpose helpers (parsePath, parseStatus, parseLatency, parseAgent, accumulator methods), so each rule can be read, tested and changed in isolation, whereas Version B packs all validation, user-agent decoding and statistics into two long functions.
- go-logstats rep 3, A=without, B=with: B — B splits parsing and accumulation into small named helpers (parseStatus, parseLatency, parseAgent, accumulator) that can each be read, tested and changed in isolation without altering behavior, while A packs the same logic into one long parseLine with the quoted-agent decoder nested inside it.
- go-pricing rep 1, A=without, B=with: B — B breaks the pricing rules into small, well-named helpers (regionRates table, lineDiscount, applyCoupon, shippingCost) so each policy can be read and changed in isolation, while A packs everything into one long function; B's only blemish is the vague variable name `x`.
- go-pricing rep 1, A=with, B=without: A — A splits validation, member discounts, coupons and shipping into small named helpers and keeps region rates in a data table, so each rule can be found, tested and changed on its own, while B packs every rule into one long function (A's only real blemish is the vague variable name `x`).
- go-pricing rep 2, A=with, B=without: A — Version A splits validation, member discounts, and coupon logic into small named helpers, and keeps region rates in a single table that drives both validation and lookup, so each rule is easier to find and change than in B's single long function.
- go-pricing rep 2, A=without, B=with: B — B separates validation, member discounts, coupon logic, and region rates into small named functions and a data table. That makes each pricing rule easy to locate and change in isolation, while A packs everything into one long function with magic-number tuples.
- go-pricing rep 3, A=with, B=without: A — Version A splits validation, member discounts, and coupon logic into small named helpers and keeps region rates in a single data table, so each rule can be read and changed in isolation, whereas B packs everything into one long Quote function.
- go-pricing rep 3, A=without, B=with: B — B behaves the same as A but moves validation, member discount, coupon logic and region rates into small named helpers and a lookup table, so Quote reads as a clear pipeline and each rule can be found and changed in one place.
- js-markdown rep 1, A=without, B=with: B — B splits inline parsing into small `tryCode`/`tryLink`/`tryBold`/`tryItalic` helpers that share one `{html, next}` return shape, so each rule can be read and changed on its own, whereas A packs every rule into one long branching loop with scattered `continue`s.
- js-markdown rep 1, A=with, B=without: A — Version A splits inline parsing into small named helpers (tryCode, tryLink, tryBold, tryItalic) dispatched by matchAt, while Version B packs every construct into one long branchy loop with scattered `continue`s and fall-throughs, which makes A easier to read and safer to change.
- js-markdown rep 2, A=with, B=without: A — Version A splits inline parsing into small, uniformly-shaped rule functions with explicit bold/italic flags and separates line classification from block rendering, whereas Version B packs everything into one long branchy loop with a stringly-typed `mode` whose values ('full', 'bold', 'em') are confusing and easy to misuse.
- js-markdown rep 2, A=without, B=with: B — B splits inline parsing into small named rules with a uniform return contract and separates line classification from block rendering, which makes each piece easier to read and change in isolation; A's single large inline loop uses a confusing string `mode` parameter, including a 'bold' value that is never passed.
- js-markdown rep 3, A=without, B=with: B — Version B splits inline parsing into small named rule functions dispatched by `matchAt` and uses a clear boolean flag, while Version A packs everything into one long branching loop with magic numeric modes (0/1/2) and a redundant condition, which makes A harder to follow and riskier to change.
- js-markdown rep 3, A=with, B=without: A — Version A breaks inline parsing into small named rule functions with a clear dispatcher and a boolean flag, while Version B packs every rule into one deeply nested loop driven by an opaque numeric mode with a convoluted italic condition, so B is harder to read and riskier to change.
- rust-config rep 1, A=without, B=with: B — Version B splits parsing into small, well-named functions (`classify`, `read_sections`, `apply_env`, `parse_list`, `valid_name`) with a typed `Line` enum, so each piece is easier to read and change safely than Version A's monolithic `parse` with nested loops and an `Option`/`unwrap` caching pattern.
- rust-config rep 1, A=with, B=without: A — Version A splits parsing into small named steps (classify, read_sections, apply_env, parse_list, split_items), so each piece can be read and changed on its own, while Version B packs line parsing, env overrides and required-key checks into one long `parse` function with nested loops and lazy-parse state.
- rust-config rep 2, A=with, B=without: A — Version A splits parsing into small, well-named functions (read_text, parse_header, parse_assignment, apply_env, env_name, parse_list), while Version B packs header parsing, assignment parsing, env overrides and required checks into one long `parse` function; A's terse boolean state updates in split_items are the one spot where B reads more clearly.
- rust-config rep 2, A=without, B=with: B — B splits the monolithic parse into small, well-named stages (read_text, parse_header, parse_assignment, apply_env, env_name, parse_list), so each piece is easier to understand and change in isolation; its only drawback is the terser boolean state updates in split_items.
- rust-config rep 3, A=without, B=with: B — B breaks the monolithic `parse` into small, well-named steps (`parse_line`, `read_sections`, `apply_env`, `valid_name`, `unescape`) with a `Line` enum, removes duplicated name-validation logic, and updates env overrides in place instead of collecting keys and re-looking them up with `unwrap`, while behaving the same as A.
- rust-config rep 3, A=with, B=without: A — Version A splits parsing into focused helpers (parse_line, read_sections, apply_env, valid_name, parse_header) with no duplicated validation, while Version B packs header, key, env-override and required-key logic into one long `parse` function with inline repeated name checks and manual slicing that are harder to follow and change safely.
- ts-orders rep 1, A=without, B=with: B — B's `ALLOWED_FROM` table shows every legal transition in one place, and it keeps validation separate from state changes, so adding or changing an event is more local; its weak spots are the unchecked `deliveredAt as string` cast and the refund-specific checks scattered through `apply`.
- ts-orders rep 1, A=with, B=without: A — Version A keeps the allowed transitions in one declarative table and splits validation, state changes and history into small focused functions, so each rule is easier to find and change than in B's long switch, though its refund checks in `apply` and the `deliveredAt as string` cast are minor blemishes.
- ts-orders rep 2, A=with, B=without: B — Version B keeps each event's validation and state changes together in one exhaustive switch, while Version A splits the refund logic between `apply` and its handler and needs an unsafe cast in `transition` to make the handler map type-check.
- ts-orders rep 2, A=without, B=with: A — Version A keeps each event's guard and state change together in one switch with no type casts, while B splits refund's validation away from its handler and has to cast the handler map, so it adds indirection without making the code safer to change.
- ts-orders rep 3, A=without, B=with: B — B keeps transition validation in `apply`, puts change computation in a separate exhaustive `changes` switch, and moves per-event checks into small named helpers (`payChanges`, `shipChanges`, `returnChanges`), so each piece is easier to read and change than A's single long nested function.
- ts-orders rep 3, A=with, B=without: A — Version A splits each transition's validation and state changes into small named helpers returning Partial<Order>, keeping the guard logic in apply short and the per-event logic easy to find and change, whereas B packs everything into one long function with a mutable `changes` variable and break-based switch.
- ts-signup rep 1, A=with, B=without: A — Version A splits each field's rules into small, named, independently testable functions (emailError, passwordError, parseYmd, ageOn, minAge, etc.) with a short orchestrator, whereas Version B packs all logic into one long function with mutable locals and inline date math that is harder to read and change safely.
- ts-signup rep 1, A=without, B=with: B — B splits each field's rules into small, named, independently testable functions with a short top-level orchestrator, whereas A packs everything into one long function with shared mutable state (emailOk, by/bm/bd), though B drops A's runtime typeof guards and leans on a dense lookahead regex.
- ts-signup rep 2, A=with, B=without: A — Version A splits each field's rules into small, named, independently testable functions (emailError, passwordError, birthDateError, minAge, ageOn, referralError), so `validateSignup` reads as a short summary and each rule can be changed in one place, whereas Version B puts every rule in one long function separated only by comments.
- ts-signup rep 2, A=without, B=with: B — Version B breaks each field's rules into small, named, single-purpose functions with a uniform `set` pattern in `validateSignup`, so each rule can be read, tested and changed in isolation, while Version A packs all validation into one long function linked by shared local variables.
- ts-signup rep 3, A=with, B=without: A — Version A splits each field's rules into small, single-purpose functions (passwordError, usernameError, referralError, ageOn, minAge) and keeps validateSignup a flat, uniform list of calls, which makes each rule easy to find, test and change; Version B inlines password, username and referral logic into the main function and packs parsing, date validation, age calculation and per-country rules into one birthDateError, although its step-by-step email checks are more readable than A's lookaround regexes.
- ts-signup rep 3, A=without, B=with: B — B splits each rule into small, named, single-purpose functions (passwordError, usernameError, ageOn, minAge, referralError), so each rule can be read, tested and changed in isolation, whereas A puts password, username and referral logic inline in validateSignup; B's dense lookaround email regexes are the one place where A's explicit step-by-step checks read better.
