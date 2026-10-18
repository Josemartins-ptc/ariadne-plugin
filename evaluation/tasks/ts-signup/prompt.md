Implement `validateSignup` in `src/signup.ts`. The type `SignupForm` and the function signature are already there; the function currently throws "not implemented".

```ts
export function validateSignup(form: SignupForm, today: string): Record<string, string>
```

`today` is the current date as `YYYY-MM-DD`; it is always a valid calendar date. The function returns an object that maps a field name to exactly one error code. A valid form returns an empty object `{}`. A field without an error must not appear in the result. Field values are used exactly as given: nothing is trimmed and no case is changed unless a rule says so. "Letters" and "digits" below always mean ASCII `A-Z`, `a-z` and `0-9`.

The result keys are the field names: `email`, `password`, `username`, `birthDate`, `country`, `referralCode`, `acceptedTerms`, `marketingConsent`.

## email

- `"required"` when the email is empty or contains only whitespace.
- Otherwise `"invalid"` unless all of these hold:
  - the whole email is at most 254 characters long;
  - it contains exactly one `@`, splitting it into a local part and a domain;
  - the local part is 1 to 64 characters, made only of letters, digits and `. _ % + -`; it does not start or end with `.` and does not contain `..`;
  - the domain is two or more labels separated by `.`; every label is 1 to 63 characters of letters, digits and `-`, and does not start or end with `-`;
  - the last label is at least 2 characters and made only of letters.

## password

Exactly one code is reported, the first that applies in this order:

1. `"too_short"`: fewer than 10 characters (an empty password is `"too_short"`).
2. `"missing_upper"`: no uppercase letter `A-Z`.
3. `"missing_lower"`: no lowercase letter `a-z`.
4. `"missing_digit"`: no digit `0-9`.
5. `"contains_email"`: the password contains the email's local part (the text before the `@`), compared case-insensitively. This rule only applies when the email has no error and its local part is at least 3 characters long.

## username

- `"invalid"` unless it is 3 to 20 characters long, made only of letters, digits and `_`, and does not start with a digit. An empty username is `"invalid"`.
- Otherwise `"reserved"` when it equals one of `admin`, `root`, `support`, `help`, compared case-insensitively (so `Admin` is reserved).

## country

- `"invalid"` unless it is exactly two uppercase letters (`A-Z`). Whether the code is a real ISO country is not checked.

The EU countries are: `AT BE BG HR CY CZ DK EE FI FR DE GR IE IT LV LT LU MT NL PL PT RO SK SI ES SE`.

## birthDate

- `"invalid_date"` when any of these holds:
  - it does not have the exact form `YYYY-MM-DD` (4 digits, `-`, 2 digits, `-`, 2 digits);
  - the year is below 1900;
  - it is not a real calendar date (month 1-12, day within that month; February has 29 days in Gregorian leap years: divisible by 4, except centuries not divisible by 400);
  - it is after `today`.
- Otherwise `"too_young"` when the age is below the minimum age for the country: 16 for EU countries, 13 for `US`, 18 for every other country. This check is skipped when the country has an error.

The age is the number of full years between the birth date and `today`: `today`'s year minus the birth year, minus 1 if `today`'s (month, day) comes before the birth (month, day). A person reaches the age on their birthday itself. Someone born on 29 February therefore turns a year older on 1 March in non-leap years. A birth date equal to `today` is age 0.

## referralCode

Optional. When it is `undefined` or the empty string, it is not checked.

- `"invalid_format"` unless it is exactly 3 uppercase letters, `-`, 4 digits (for example `CAT-1100`).
- Otherwise `"bad_checksum"` unless (sum of the 4 digits) mod 7 equals (position of the first letter in the alphabet, `A` = 0, `B` = 1, ... `Z` = 25) mod 7. Example: `CAT-1100` is valid (C = 2; 1+1+0+0 = 2); `ABC-1234` is not (A = 0; 10 mod 7 = 3).

## acceptedTerms

- `"required"` unless it is exactly `true`.

## marketingConsent

- For an EU country: `"required"` unless it is a boolean (`true` or `false` are both fine; `undefined` or a missing value is not).
- For any other country, or when the country has an error, it is not checked.

## Several errors

All fields are validated independently (except where a rule above says it depends on another field), and every field with an error appears in the result.

The visible tests are in `src/signup.test.ts`. Run them with `node --test` (Node 25 runs the `.ts` files directly; there are no dependencies to install).
