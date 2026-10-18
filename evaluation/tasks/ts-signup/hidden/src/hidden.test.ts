import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSignup, type SignupForm } from "./signup.ts";

const TODAY = "2026-10-18";

function validForm(): SignupForm {
  return {
    email: "jane.doe@example.com",
    password: "Str0ngPassw0rd",
    username: "jane_doe",
    birthDate: "1990-05-17",
    country: "PT",
    acceptedTerms: true,
    marketingConsent: false,
  };
}

function errorsWith(overrides: Partial<SignupForm>, today: string = TODAY): Record<string, string> {
  return validateSignup({ ...validForm(), ...overrides }, today);
}

test("hidden: empty or whitespace-only email is required", () => {
  assert.deepEqual(errorsWith({ email: "" }), { email: "required" });
  assert.deepEqual(errorsWith({ email: "   " }), { email: "required" });
});

test("hidden: email without exactly one @ is invalid", () => {
  assert.deepEqual(errorsWith({ email: "jane.example.com" }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: "jane@doe@example.com" }), { email: "invalid" });
});

test("hidden: email local part dots and characters are checked", () => {
  assert.deepEqual(errorsWith({ email: ".jane@example.com" }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: "jane.@example.com" }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: "jane..doe@example.com" }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: "ja ne@example.com" }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: "@example.com" }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: " jane.doe@example.com" }), { email: "invalid" });
});

test("hidden: email domain needs two labels and a letters-only TLD of 2+", () => {
  assert.deepEqual(errorsWith({ email: "jane@localhost" }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: "jane@example.c" }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: "jane@example.c0m" }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: "jane@-example.com" }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: "jane@example-.com" }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: "jane@example..com" }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: `jane@${"b".repeat(64)}.com` }), { email: "invalid" });
});

test("hidden: email with all allowed characters is accepted", () => {
  assert.deepEqual(errorsWith({ email: "J.d+tag_1%x-y@mail-01.Example.co" }), {});
});

test("hidden: email length limits are 254 overall and 64 for the local part", () => {
  const domain = (last: number) => `${"b".repeat(63)}.${"b".repeat(63)}.${"b".repeat(last)}.com`;
  const local = "a".repeat(64);
  assert.equal(`${local}@${domain(57)}`.length, 254);
  assert.deepEqual(errorsWith({ email: `${local}@${domain(57)}` }), {});
  assert.deepEqual(errorsWith({ email: `${local}@${domain(58)}` }), { email: "invalid" });
  assert.deepEqual(errorsWith({ email: `${"a".repeat(65)}@example.com` }), { email: "invalid" });
});

test("hidden: each missing character class has its own code; 10 characters is enough", () => {
  assert.deepEqual(errorsWith({ password: "str0ngpassw0rd" }), { password: "missing_upper" });
  assert.deepEqual(errorsWith({ password: "STR0NGPASSW0RD" }), { password: "missing_lower" });
  assert.deepEqual(errorsWith({ password: "StrongPassword" }), { password: "missing_digit" });
  assert.deepEqual(errorsWith({ password: "Abcdefgh1j" }), {});
});

test("hidden: password codes follow the fixed priority order", () => {
  assert.deepEqual(errorsWith({ password: "abcdefghi" }), { password: "too_short" });
  assert.deepEqual(errorsWith({ password: "abcdefghij" }), { password: "missing_upper" });
  assert.deepEqual(errorsWith({ password: "ABCDEFGHIJ" }), { password: "missing_lower" });
  assert.deepEqual(errorsWith({ password: "jane.doe123" }), { password: "missing_upper" });
  assert.deepEqual(errorsWith({ password: "" }), { password: "too_short" });
});

test("hidden: password containing the email local part case-insensitively", () => {
  assert.deepEqual(errorsWith({ password: "XJANE.DOE7x" }), { password: "contains_email" });
});

test("hidden: contains_email applies from a 3-character local part", () => {
  assert.deepEqual(errorsWith({ email: "jd@example.com", password: "Xjd1234567" }), {});
  assert.deepEqual(errorsWith({ email: "jdo@example.com", password: "XJDO123456a" }), {
    password: "contains_email",
  });
});

test("hidden: contains_email is skipped when the email has an error", () => {
  assert.deepEqual(errorsWith({ email: "jane.doe@localhost", password: "Jane.doe12345" }), {
    email: "invalid",
  });
});

test("hidden: username length must be 3 to 20", () => {
  assert.deepEqual(errorsWith({ username: "ab" }), { username: "invalid" });
  assert.deepEqual(errorsWith({ username: "abc" }), {});
  assert.deepEqual(errorsWith({ username: "a".repeat(20) }), {});
  assert.deepEqual(errorsWith({ username: "a".repeat(21) }), { username: "invalid" });
  assert.deepEqual(errorsWith({ username: "" }), { username: "invalid" });
});

test("hidden: username characters and first character", () => {
  assert.deepEqual(errorsWith({ username: "1jane" }), { username: "invalid" });
  assert.deepEqual(errorsWith({ username: "_jane9" }), {});
  assert.deepEqual(errorsWith({ username: "jane-doe" }), { username: "invalid" });
  assert.deepEqual(errorsWith({ username: "jané" }), { username: "invalid" });
});

test("hidden: reserved usernames are matched case-insensitively and exactly", () => {
  assert.deepEqual(errorsWith({ username: "ROOT" }), { username: "reserved" });
  assert.deepEqual(errorsWith({ username: "Support" }), { username: "reserved" });
  assert.deepEqual(errorsWith({ username: "help" }), { username: "reserved" });
  assert.deepEqual(errorsWith({ username: "admin1" }), {});
});

test("hidden: country must be two uppercase letters; an invalid country skips age and consent", () => {
  assert.deepEqual(errorsWith({ country: "pt", birthDate: "2020-01-01", marketingConsent: undefined }), {
    country: "invalid",
  });
  assert.deepEqual(errorsWith({ country: "PRT" }), { country: "invalid" });
  assert.deepEqual(errorsWith({ country: "" }), { country: "invalid" });
});

test("hidden: badly formatted birth dates are invalid_date", () => {
  assert.deepEqual(errorsWith({ birthDate: "1990-5-17" }), { birthDate: "invalid_date" });
  assert.deepEqual(errorsWith({ birthDate: "17/05/1990" }), { birthDate: "invalid_date" });
  assert.deepEqual(errorsWith({ birthDate: "" }), { birthDate: "invalid_date" });
  assert.deepEqual(errorsWith({ birthDate: "1990-05-17T00:00" }), { birthDate: "invalid_date" });
});

test("hidden: impossible calendar dates are invalid_date", () => {
  assert.deepEqual(errorsWith({ birthDate: "1990-02-30" }), { birthDate: "invalid_date" });
  assert.deepEqual(errorsWith({ birthDate: "1990-13-01" }), { birthDate: "invalid_date" });
  assert.deepEqual(errorsWith({ birthDate: "1990-00-10" }), { birthDate: "invalid_date" });
  assert.deepEqual(errorsWith({ birthDate: "1990-04-31" }), { birthDate: "invalid_date" });
  assert.deepEqual(errorsWith({ birthDate: "1990-01-00" }), { birthDate: "invalid_date" });
});

test("hidden: Gregorian leap years decide 29 February", () => {
  assert.deepEqual(errorsWith({ birthDate: "1900-02-29" }), { birthDate: "invalid_date" });
  assert.deepEqual(errorsWith({ birthDate: "2000-02-29" }), {});
  assert.deepEqual(errorsWith({ birthDate: "1996-02-29" }), {});
  assert.deepEqual(errorsWith({ birthDate: "1997-02-29" }), { birthDate: "invalid_date" });
});

test("hidden: years before 1900 are invalid_date", () => {
  assert.deepEqual(errorsWith({ birthDate: "1899-12-31" }), { birthDate: "invalid_date" });
  assert.deepEqual(errorsWith({ birthDate: "1900-01-01" }), {});
});

test("hidden: a future birth date is invalid_date; today is too_young", () => {
  assert.deepEqual(errorsWith({ birthDate: "2026-10-19" }), { birthDate: "invalid_date" });
  assert.deepEqual(errorsWith({ birthDate: "2027-01-01" }), { birthDate: "invalid_date" });
  assert.deepEqual(errorsWith({ birthDate: "2026-10-18" }), { birthDate: "too_young" });
});

test("hidden: EU minimum age is 16, reached on the birthday", () => {
  assert.deepEqual(errorsWith({ country: "PT", birthDate: "2010-10-18" }), {});
  assert.deepEqual(errorsWith({ country: "PT", birthDate: "2010-10-19" }), { birthDate: "too_young" });
  assert.deepEqual(errorsWith({ country: "DE", birthDate: "2010-11-01" }), { birthDate: "too_young" });
});

test("hidden: US minimum age is 13, counted in full years", () => {
  assert.deepEqual(errorsWith({ country: "US", birthDate: "2013-10-18" }), {});
  assert.deepEqual(errorsWith({ country: "US", birthDate: "2013-10-19" }), { birthDate: "too_young" });
  assert.deepEqual(errorsWith({ country: "US", birthDate: "2013-12-01" }), { birthDate: "too_young" });
  assert.deepEqual(errorsWith({ country: "US", birthDate: "2012-12-31" }), {});
});

test("hidden: other countries need age 18", () => {
  assert.deepEqual(errorsWith({ country: "BR", birthDate: "2008-10-18" }), {});
  assert.deepEqual(errorsWith({ country: "BR", birthDate: "2008-10-19" }), { birthDate: "too_young" });
  assert.deepEqual(errorsWith({ country: "GB", birthDate: "2010-01-01" }), { birthDate: "too_young" });
});

test("hidden: a 29 February birthday counts on 1 March in non-leap years", () => {
  const form = { country: "BR", birthDate: "2008-02-29" };
  assert.deepEqual(errorsWith(form, "2026-02-28"), { birthDate: "too_young" });
  assert.deepEqual(errorsWith(form, "2026-03-01"), {});
});

test("hidden: referral code is optional and valid when the checksum matches", () => {
  assert.deepEqual(errorsWith({ referralCode: "CAT-1100" }), {});
  assert.deepEqual(errorsWith({ referralCode: "HAT-0700" }), {});
  assert.deepEqual(errorsWith({ referralCode: "ZZZ-0004" }), {});
  assert.deepEqual(errorsWith({ referralCode: "OAK-7770" }), {});
  assert.deepEqual(errorsWith({ referralCode: undefined }), {});
  assert.deepEqual(errorsWith({ referralCode: "" }), {});
});

test("hidden: referral checksum mismatch is bad_checksum", () => {
  assert.deepEqual(errorsWith({ referralCode: "ABC-1234" }), { referralCode: "bad_checksum" });
  assert.deepEqual(errorsWith({ referralCode: "CAT-1101" }), { referralCode: "bad_checksum" });
});

test("hidden: malformed referral codes are invalid_format", () => {
  for (const code of ["cat-1100", "CA-1100", "CAT1100", "CAT-110", "CAT-11000", " CAT-1100", "CAT-11O0"]) {
    assert.deepEqual(errorsWith({ referralCode: code }), { referralCode: "invalid_format" }, code);
  }
});

test("hidden: terms must be accepted", () => {
  assert.deepEqual(errorsWith({ acceptedTerms: false }), { acceptedTerms: "required" });
});

test("hidden: only EU countries need an explicit marketing consent boolean", () => {
  assert.deepEqual(errorsWith({ country: "FR", marketingConsent: undefined }), { marketingConsent: "required" });
  assert.deepEqual(errorsWith({ country: "GR", marketingConsent: true }), {});
  assert.deepEqual(errorsWith({ country: "SE", marketingConsent: false }), {});
  assert.deepEqual(errorsWith({ country: "US", marketingConsent: undefined }), {});
  assert.deepEqual(errorsWith({ country: "CH", marketingConsent: undefined }), {});
});

test("hidden: every failing field is reported at once", () => {
  const form: SignupForm = {
    email: "not-an-email",
    password: "short",
    username: "9lives",
    birthDate: "2015-06-01",
    country: "IT",
    referralCode: "ABC-1234",
    acceptedTerms: false,
  };
  assert.deepEqual(validateSignup(form, TODAY), {
    email: "invalid",
    password: "too_short",
    username: "invalid",
    birthDate: "too_young",
    referralCode: "bad_checksum",
    acceptedTerms: "required",
    marketingConsent: "required",
  });
});
