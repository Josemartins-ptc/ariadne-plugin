export type SignupForm = {
  email: string;
  password: string;
  username: string;
  birthDate: string; // YYYY-MM-DD
  country: string; // ISO 3166-1 alpha-2, e.g. "PT"
  referralCode?: string;
  acceptedTerms: boolean;
  marketingConsent?: boolean;
  phone?: string;
};

const EU = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "),
);
const RESERVED = new Set(["admin", "root", "support", "help"]);

function emailError(email: string): string | undefined {
  if (email.trim() === "") return "required";
  if (email.length > 254) return "invalid";
  const parts = email.split("@");
  if (parts.length !== 2) return "invalid";
  const [local, domain] = parts;
  if (local.length < 1 || local.length > 64) return "invalid";
  if (!/^[A-Za-z0-9._%+-]+$/.test(local)) return "invalid";
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return "invalid";
  const labels = domain.split(".");
  if (labels.length < 2) return "invalid";
  for (const l of labels) {
    if (l.length < 1 || l.length > 63) return "invalid";
    if (!/^[A-Za-z0-9-]+$/.test(l)) return "invalid";
    if (l.startsWith("-") || l.endsWith("-")) return "invalid";
  }
  const last = labels[labels.length - 1];
  if (last.length < 2 || !/^[A-Za-z]+$/.test(last)) return "invalid";
  return undefined;
}

const PHONE_RULES: Record<string, RegExp> = {
  US: /^\+1[2-9][0-9]{9}$/,
  PT: /^\+351[0-9]{9}$/,
  DE: /^\+49[0-9]{10,11}$/,
  GB: /^\+44[0-9]{10}$/,
};
const PHONE_DEFAULT = /^\+[1-9][0-9]{6,14}$/;

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function birthDateError(birthDate: string, today: string, country: string, countryOk: boolean): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return "invalid_date";
  const y = Number(birthDate.slice(0, 4));
  const m = Number(birthDate.slice(5, 7));
  const d = Number(birthDate.slice(8, 10));
  if (y < 1900) return "invalid_date";
  if (m < 1 || m > 12) return "invalid_date";
  const dim = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (d < 1 || d > dim) return "invalid_date";
  if (birthDate > today) return "invalid_date";
  if (!countryOk) return undefined;
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7));
  const td = Number(today.slice(8, 10));
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  const min = EU.has(country) ? 16 : country === "US" ? 13 : 18;
  return age < min ? "too_young" : undefined;
}

export function validateSignup(form: SignupForm, today: string): Record<string, string> {
  const errors: Record<string, string> = {};

  const eErr = emailError(form.email);
  if (eErr) errors.email = eErr;

  const u = form.username;
  let uErr: string | undefined;
  if (!/^[A-Za-z_][A-Za-z0-9_]{2,19}$/.test(u)) uErr = "invalid";
  else if (RESERVED.has(u.toLowerCase())) uErr = "reserved";
  if (uErr) errors.username = uErr;

  const pw = form.password;
  if (pw.length < 10) errors.password = "too_short";
  else if (!/[A-Z]/.test(pw)) errors.password = "missing_upper";
  else if (!/[a-z]/.test(pw)) errors.password = "missing_lower";
  else if (!/[0-9]/.test(pw)) errors.password = "missing_digit";
  else {
    if (!eErr) {
      const local = form.email.split("@")[0];
      if (local.length >= 3 && pw.toLowerCase().includes(local.toLowerCase())) {
        errors.password = "contains_email";
      }
    }
    if (!errors.password && !uErr && pw.toLowerCase().includes(u.toLowerCase())) {
      errors.password = "contains_username";
    }
  }

  const countryOk = /^[A-Z]{2}$/.test(form.country);
  if (!countryOk) errors.country = "invalid";

  const phone = form.phone;
  if (phone !== undefined && phone !== "" && countryOk) {
    if (!(PHONE_RULES[form.country] ?? PHONE_DEFAULT).test(phone)) errors.phone = "invalid";
  }

  const bErr = birthDateError(form.birthDate, today, form.country, countryOk);
  if (bErr) errors.birthDate = bErr;

  const ref = form.referralCode;
  if (ref !== undefined && ref !== "") {
    if (!/^[A-Z]{3}-[0-9]{4}$/.test(ref)) errors.referralCode = "invalid_format";
    else {
      const sum = Number(ref[4]) + Number(ref[5]) + Number(ref[6]) + Number(ref[7]);
      if (sum % 7 !== (ref.charCodeAt(0) - 65) % 7) errors.referralCode = "bad_checksum";
    }
  }

  if (form.acceptedTerms !== true) errors.acceptedTerms = "required";

  if (countryOk && EU.has(form.country) && typeof form.marketingConsent !== "boolean") {
    errors.marketingConsent = "required";
  }

  return errors;
}
