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

const EU = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "));
const RESERVED = new Set(["admin", "root", "support", "help"]);

const LOCAL_RE = /^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9._%+-]{1,64}$/;
const LABEL_RE = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD_RE = /^[A-Za-z]{2,}$/;

function validDomain(domain: string): boolean {
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((l) => LABEL_RE.test(l))) return false;
  return TLD_RE.test(labels[labels.length - 1]);
}

function emailError(email: string): string | undefined {
  if (email.trim() === "") return "required";
  const parts = email.split("@");
  const ok = email.length <= 254 && parts.length === 2 && LOCAL_RE.test(parts[0]) && validDomain(parts[1]);
  return ok ? undefined : "invalid";
}

function passwordError(pw: string, email: string, emailErr: string | undefined): string | undefined {
  if (pw.length < 10) return "too_short";
  if (!/[A-Z]/.test(pw)) return "missing_upper";
  if (!/[a-z]/.test(pw)) return "missing_lower";
  if (!/[0-9]/.test(pw)) return "missing_digit";
  if (!emailErr) {
    const local = email.split("@")[0];
    if (local.length >= 3 && pw.toLowerCase().includes(local.toLowerCase())) return "contains_email";
  }
  return undefined;
}

function usernameError(u: string): string | undefined {
  if (!/^[A-Za-z_][A-Za-z0-9_]{2,19}$/.test(u)) return "invalid";
  if (RESERVED.has(u.toLowerCase())) return "reserved";
  return undefined;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

type Ymd = { y: number; m: number; d: number };

function parseYmd(s: string): Ymd | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function isRealDate(t: Ymd): boolean {
  if (t.y < 1900 || t.m < 1 || t.m > 12) return false;
  return t.d >= 1 && t.d <= daysInMonth(t.y, t.m);
}

function ageOn(birth: Ymd, now: Ymd): number {
  const before = now.m < birth.m || (now.m === birth.m && now.d < birth.d);
  return now.y - birth.y - (before ? 1 : 0);
}

function minAge(country: string): number {
  if (EU.has(country)) return 16;
  return country === "US" ? 13 : 18;
}

function birthDateError(b: string, today: string, country: string, countryErr: boolean): string | undefined {
  const birth = parseYmd(b);
  if (!birth || !isRealDate(birth) || b > today) return "invalid_date";
  if (countryErr) return undefined;
  return ageOn(birth, parseYmd(today)!) < minAge(country) ? "too_young" : undefined;
}

function referralError(code: string | undefined): string | undefined {
  if (code === undefined || code === "") return undefined;
  const m = /^([A-Z]{3})-([0-9]{4})$/.exec(code);
  if (!m) return "invalid_format";
  const sum = [...m[2]].reduce((a, c) => a + Number(c), 0);
  return sum % 7 === (m[1].charCodeAt(0) - 65) % 7 ? undefined : "bad_checksum";
}

export function validateSignup(form: SignupForm, today: string): Record<string, string> {
  const errors: Record<string, string | undefined> = {};
  const countryErr = !/^[A-Z]{2}$/.test(form.country);
  errors.email = emailError(form.email);
  errors.password = passwordError(form.password, form.email, errors.email);
  errors.username = usernameError(form.username);
  errors.country = countryErr ? "invalid" : undefined;
  errors.birthDate = birthDateError(form.birthDate, today, form.country, countryErr);
  errors.referralCode = referralError(form.referralCode);
  errors.acceptedTerms = form.acceptedTerms === true ? undefined : "required";
  if (!countryErr && EU.has(form.country) && typeof form.marketingConsent !== "boolean") {
    errors.marketingConsent = "required";
  }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(errors)) if (v) result[k] = v;
  return result;
}
