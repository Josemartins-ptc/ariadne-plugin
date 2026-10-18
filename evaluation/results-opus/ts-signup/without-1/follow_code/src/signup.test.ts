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

test("a valid form has no errors", () => {
  assert.deepEqual(validateSignup(validForm(), TODAY), {});
});

test("a password under 10 characters is too_short", () => {
  assert.deepEqual(validateSignup({ ...validForm(), password: "Ab1defgh" }, TODAY), {
    password: "too_short",
  });
});

test("a reserved username is reported as reserved", () => {
  assert.deepEqual(validateSignup({ ...validForm(), username: "admin" }, TODAY), {
    username: "reserved",
  });
});
