export type SignupForm = {
  email: string;
  password: string;
  username: string;
  birthDate: string; // YYYY-MM-DD
  country: string; // ISO 3166-1 alpha-2, e.g. "PT"
  referralCode?: string;
  acceptedTerms: boolean;
  marketingConsent?: boolean;
};

const EU = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "),
);
const RESERVED = new Set(["admin", "root", "support", "help"]);

function validEmail(email: string): boolean {
  if (email.length > 254) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (local.length < 1 || local.length > 64) return false;
  if (!/^[A-Za-z0-9._%+-]+$/.test(local)) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  for (const l of labels) {
    if (l.length < 1 || l.length > 63) return false;
    if (!/^[A-Za-z0-9-]+$/.test(l)) return false;
    if (l.startsWith("-") || l.endsWith("-")) return false;
  }
  return /^[A-Za-z]{2,}$/.test(labels[labels.length - 1]);
}

function daysIn(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function validateSignup(form: SignupForm, today: string): Record<string, string> {
  const errors: Record<string, string> = {};

  // email
  let emailOk = false;
  if (typeof form.email !== "string" || /^\s*$/.test(form.email)) {
    errors.email = "required";
  } else if (!validEmail(form.email)) {
    errors.email = "invalid";
  } else {
    emailOk = true;
  }

  // password
  const pw = typeof form.password === "string" ? form.password : "";
  if (pw.length < 10) errors.password = "too_short";
  else if (!/[A-Z]/.test(pw)) errors.password = "missing_upper";
  else if (!/[a-z]/.test(pw)) errors.password = "missing_lower";
  else if (!/[0-9]/.test(pw)) errors.password = "missing_digit";
  else if (emailOk) {
    const local = form.email.split("@")[0];
    if (local.length >= 3 && pw.toLowerCase().includes(local.toLowerCase())) {
      errors.password = "contains_email";
    }
  }

  // username
  const u = form.username;
  if (typeof u !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{2,19}$/.test(u)) {
    errors.username = "invalid";
  } else if (RESERVED.has(u.toLowerCase())) {
    errors.username = "reserved";
  }

  // country
  const countryOk = typeof form.country === "string" && /^[A-Z]{2}$/.test(form.country);
  if (!countryOk) errors.country = "invalid";

  // birthDate
  const b = form.birthDate;
  let dateOk = false;
  let by = 0;
  let bm = 0;
  let bd = 0;
  if (typeof b === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(b)) {
    by = Number(b.slice(0, 4));
    bm = Number(b.slice(5, 7));
    bd = Number(b.slice(8, 10));
    dateOk =
      by >= 1900 && bm >= 1 && bm <= 12 && bd >= 1 && bd <= daysIn(by, bm) && b <= today;
  }
  if (!dateOk) {
    errors.birthDate = "invalid_date";
  } else if (countryOk) {
    const ty = Number(today.slice(0, 4));
    const tm = Number(today.slice(5, 7));
    const td = Number(today.slice(8, 10));
    const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
    const min = EU.has(form.country) ? 16 : form.country === "US" ? 13 : 18;
    if (age < min) errors.birthDate = "too_young";
  }

  // referralCode
  const r = form.referralCode;
  if (r !== undefined && r !== "") {
    if (typeof r !== "string" || !/^[A-Z]{3}-[0-9]{4}$/.test(r)) {
      errors.referralCode = "invalid_format";
    } else {
      const sum = [...r.slice(4)].reduce((a, c) => a + Number(c), 0);
      if (sum % 7 !== (r.charCodeAt(0) - 65) % 7) errors.referralCode = "bad_checksum";
    }
  }

  if (form.acceptedTerms !== true) errors.acceptedTerms = "required";

  if (countryOk && EU.has(form.country) && typeof form.marketingConsent !== "boolean") {
    errors.marketingConsent = "required";
  }

  return errors;
}
