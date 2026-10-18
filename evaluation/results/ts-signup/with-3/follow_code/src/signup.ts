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

const EU = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "));
const RESERVED = ["admin", "root", "support", "help"];

const LOCAL_RE = /^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9._%+-]{1,64}$/;
const LABEL_RE = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;
const TLD_RE = /^[A-Za-z]{2,}$/;

function isValidDomain(domain: string): boolean {
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((l) => LABEL_RE.test(l)) && TLD_RE.test(labels[labels.length - 1]);
}

function emailError(email: string): string | undefined {
  if (email.trim() === "") return "required";
  const parts = email.split("@");
  const valid = email.length <= 254 && parts.length === 2 && LOCAL_RE.test(parts[0]) && isValidDomain(parts[1]);
  return valid ? undefined : "invalid";
}

function passwordError(
  pw: string,
  email: string,
  emailErr: string | undefined,
  username: string,
  usernameErr: string | undefined,
): string | undefined {
  if (typeof pw !== "string" || pw.length < 10) return "too_short";
  if (!/[A-Z]/.test(pw)) return "missing_upper";
  if (!/[a-z]/.test(pw)) return "missing_lower";
  if (!/[0-9]/.test(pw)) return "missing_digit";
  if (!emailErr) {
    const local = email.split("@")[0];
    if (local.length >= 3 && pw.toLowerCase().includes(local.toLowerCase())) return "contains_email";
  }
  if (!usernameErr && pw.toLowerCase().includes(username.toLowerCase())) return "contains_username";
  return undefined;
}

const PHONE_RULES: Record<string, RegExp> = {
  US: /^\+1[2-9][0-9]{9}$/,
  PT: /^\+351[0-9]{9}$/,
  DE: /^\+49[0-9]{10,11}$/,
  GB: /^\+44[0-9]{10}$/,
};
const PHONE_DEFAULT = /^\+[1-9][0-9]{6,14}$/;

function phoneError(phone: string | undefined, country: string): string | undefined {
  if (phone === undefined || phone === "") return undefined;
  if (typeof phone !== "string") return "invalid";
  const re = Object.hasOwn(PHONE_RULES, country) ? PHONE_RULES[country] : PHONE_DEFAULT;
  return re.test(phone) ? undefined : "invalid";
}

function usernameError(u: string): string | undefined {
  if (typeof u !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{2,19}$/.test(u)) return "invalid";
  if (RESERVED.includes(u.toLowerCase())) return "reserved";
  return undefined;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isValidDate(y: number, m: number, d: number): boolean {
  if (y < 1900 || m < 1 || m > 12 || d < 1) return false;
  const dim = m === 2 && isLeap(y) ? 29 : DAYS[m - 1];
  return d <= dim;
}

function ageOn(birth: string, today: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

function minAge(country: string): number {
  if (EU.has(country)) return 16;
  return country === "US" ? 13 : 18;
}

function birthDateError(b: string, today: string, country: string, countryErr: boolean): string | undefined {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(b);
  if (!m || !isValidDate(Number(m[1]), Number(m[2]), Number(m[3])) || b > today) return "invalid_date";
  if (countryErr) return undefined;
  return ageOn(b, today) < minAge(country) ? "too_young" : undefined;
}

function referralError(code: string | undefined): string | undefined {
  if (code === undefined || code === "") return undefined;
  if (typeof code !== "string" || !/^[A-Z]{3}-[0-9]{4}$/.test(code)) return "invalid_format";
  const sum = [...code.slice(4)].reduce((a, c) => a + Number(c), 0);
  return sum % 7 === (code.charCodeAt(0) - 65) % 7 ? undefined : "bad_checksum";
}

export function validateSignup(form: SignupForm, today: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const set = (k: string, v: string | undefined) => {
    if (v) errors[k] = v;
  };
  const emailErr = emailError(form.email);
  set("email", emailErr);
  const usernameErr = usernameError(form.username);
  set("password", passwordError(form.password, form.email, emailErr, form.username, usernameErr));
  set("username", usernameErr);
  const countryErr = typeof form.country !== "string" || !/^[A-Z]{2}$/.test(form.country);
  if (countryErr) errors.country = "invalid";
  set("birthDate", birthDateError(form.birthDate, today, form.country, countryErr));
  if (!countryErr) set("phone", phoneError(form.phone, form.country));
  set("referralCode", referralError(form.referralCode));
  if (form.acceptedTerms !== true) errors.acceptedTerms = "required";
  if (!countryErr && EU.has(form.country) && typeof form.marketingConsent !== "boolean") {
    errors.marketingConsent = "required";
  }
  return errors;
}
