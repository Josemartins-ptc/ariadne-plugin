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

function errorsWith(overrides: Record<string, unknown>): Record<string, string> {
  return validateSignup({ ...validForm(), ...overrides } as SignupForm, TODAY);
}

test("followup: absent or empty phone is not checked", () => {
  assert.deepEqual(errorsWith({ phone: undefined }), {});
  assert.deepEqual(errorsWith({ phone: "" }), {});
});

test("followup: US phone is +1 and 10 digits starting 2-9", () => {
  assert.deepEqual(errorsWith({ country: "US", phone: "+12025550123" }), {});
  assert.deepEqual(errorsWith({ country: "US", phone: "+10255501234" }), { phone: "invalid" });
  assert.deepEqual(errorsWith({ country: "US", phone: "+11255501234" }), { phone: "invalid" });
  assert.deepEqual(errorsWith({ country: "US", phone: "+1202555012" }), { phone: "invalid" });
  assert.deepEqual(errorsWith({ country: "US", phone: "+120255501234" }), { phone: "invalid" });
});

test("followup: phone allows only + and digits", () => {
  assert.deepEqual(errorsWith({ country: "US", phone: "+1 202 555 0123" }), { phone: "invalid" });
  assert.deepEqual(errorsWith({ country: "US", phone: "12025550123" }), { phone: "invalid" });
  assert.deepEqual(errorsWith({ country: "FR", phone: "+33-612345678" }), { phone: "invalid" });
  assert.deepEqual(errorsWith({ country: "FR", phone: "+" }), { phone: "invalid" });
});

test("followup: PT phone is +351 and exactly 9 digits", () => {
  assert.deepEqual(errorsWith({ phone: "+351912345678" }), {});
  assert.deepEqual(errorsWith({ phone: "+35191234567" }), { phone: "invalid" });
  assert.deepEqual(errorsWith({ phone: "+3519123456789" }), { phone: "invalid" });
  assert.deepEqual(errorsWith({ phone: "+34912345678" }), { phone: "invalid" });
});

test("followup: DE phone is +49 and 10 or 11 digits", () => {
  assert.deepEqual(errorsWith({ country: "DE", phone: "+491701234567" }), {});
  assert.deepEqual(errorsWith({ country: "DE", phone: "+4917012345678" }), {});
  assert.deepEqual(errorsWith({ country: "DE", phone: "+49170123456" }), { phone: "invalid" });
  assert.deepEqual(errorsWith({ country: "DE", phone: "+49170123456789" }), { phone: "invalid" });
});

test("followup: GB phone is +44 and exactly 10 digits", () => {
  assert.deepEqual(errorsWith({ country: "GB", phone: "+442071234567" }), {});
  assert.deepEqual(errorsWith({ country: "GB", phone: "+44207123456" }), { phone: "invalid" });
  assert.deepEqual(errorsWith({ country: "GB", phone: "+4420712345678" }), { phone: "invalid" });
});

test("followup: other countries take + and 7 to 15 digits not starting with 0", () => {
  assert.deepEqual(errorsWith({ country: "FR", phone: "+33612345678" }), {});
  assert.deepEqual(errorsWith({ country: "BR", phone: "+1234567" }), {});
  assert.deepEqual(errorsWith({ country: "BR", phone: "+123456" }), { phone: "invalid" });
  assert.deepEqual(errorsWith({ country: "BR", phone: "+123456789012345" }), {});
  assert.deepEqual(errorsWith({ country: "BR", phone: "+1234567890123456" }), { phone: "invalid" });
  assert.deepEqual(errorsWith({ country: "BR", phone: "+0123456789" }), { phone: "invalid" });
});

test("followup: other countries do not use the US, PT, DE or GB rules", () => {
  assert.deepEqual(errorsWith({ country: "BR", phone: "+10255501234" }), {});
  assert.deepEqual(errorsWith({ country: "ES", phone: "+35191234567" }), {});
});

test("followup: phone is not checked when the country has an error", () => {
  assert.deepEqual(errorsWith({ country: "pt", phone: "abc" }), { country: "invalid" });
});

test("followup: password containing the username is contains_username", () => {
  assert.deepEqual(errorsWith({ username: "maria_x", password: "Maria_X2024!!" }), {
    password: "contains_username",
  });
  assert.deepEqual(errorsWith({ password: "my-JANE_DOE-77" }), { password: "contains_username" });
});

test("followup: contains_email wins over contains_username", () => {
  assert.deepEqual(errorsWith({ password: "JANE.DOE_jane_doe1" }), { password: "contains_email" });
});

test("followup: earlier password rules still win over contains_username", () => {
  assert.deepEqual(errorsWith({ username: "maria_x", password: "maria_x2024" }), { password: "missing_upper" });
  assert.deepEqual(errorsWith({ username: "maria_x", password: "Maria_X" }), { password: "too_short" });
});

test("followup: contains_username is skipped when the username has an error", () => {
  assert.deepEqual(errorsWith({ username: "1abc", password: "Xx1abcdefgh" }), { username: "invalid" });
  assert.deepEqual(errorsWith({ username: "admin", password: "Admin12345x" }), { username: "reserved" });
});

test("followup: phone errors are reported with the other fields", () => {
  assert.deepEqual(
    errorsWith({ country: "US", phone: "+1555", username: "bob_1", password: "Bob_1passw0rd", acceptedTerms: false }),
    { phone: "invalid", password: "contains_username", acceptedTerms: "required" },
  );
});
