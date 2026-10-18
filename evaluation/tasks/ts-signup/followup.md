Two changes to `validateSignup` in `src/signup.ts`.

## 1. Optional phone number

Add an optional field `phone?: string` to `SignupForm`. Its error key in the result is `phone` and its only error code is `"invalid"`.

- When `phone` is `undefined` or the empty string, it is not checked.
- When the country has an error, the phone is not checked.
- Otherwise the phone must be `+` followed by digits only (no spaces, dashes, brackets or other characters), and match the rule for the country:
  - `US`: `+1` followed by exactly 10 digits, the first of which is 2-9 (e.g. `+12025550123`).
  - `PT`: `+351` followed by exactly 9 digits (e.g. `+351912345678`).
  - `DE`: `+49` followed by 10 or 11 digits (e.g. `+491701234567`).
  - `GB`: `+44` followed by exactly 10 digits (e.g. `+442071234567`).
  - any other country: `+` followed by 7 to 15 digits, the first of which is not `0`.
- A phone that breaks its country's rule is `"invalid"`.

## 2. Password must not contain the username

Add a password rule `"contains_username"`: the password contains the username, compared case-insensitively. It comes last in the password priority order, after `"contains_email"`, so the order is now: `too_short`, `missing_upper`, `missing_lower`, `missing_digit`, `contains_email`, `contains_username`. It only applies when the username has no error (an `"invalid"` or `"reserved"` username is not checked against the password).

Everything else stays as it is. The visible tests are still in `src/signup.test.ts`; run them with `node --test`.
