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

function localPartValid(local: string): boolean {
  return local.length <= 64 && /^[A-Za-z0-9._%+-]+$/.test(local) && !/^\.|\.$|\.\./.test(local);
}

function labelValid(label: string): boolean {
  return label.length <= 63 && /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label);
}

function domainValid(domain: string): boolean {
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every(labelValid) && /^[A-Za-z]{2,}$/.test(labels[labels.length - 1]);
}

function emailError(email: string): string | undefined {
  if (typeof email !== "string" || email.trim() === "") return "required";
  const parts = email.split("@");
  if (email.length > 254 || parts.length !== 2) return "invalid";
  return localPartValid(parts[0]) && domainValid(parts[1]) ? undefined : "invalid";
}

function passwordError(password: string, email: string, emailErr: string | undefined): string | undefined {
  if (typeof password !== "string" || password.length < 10) return "too_short";
  if (!/[A-Z]/.test(password)) return "missing_upper";
  if (!/[a-z]/.test(password)) return "missing_lower";
  if (!/[0-9]/.test(password)) return "missing_digit";
  if (emailErr) return undefined;
  const local = email.split("@")[0];
  const contains = local.length >= 3 && password.toLowerCase().includes(local.toLowerCase());
  return contains ? "contains_email" : undefined;
}

function usernameError(u: string): string | undefined {
  if (typeof u !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{2,19}$/.test(u)) return "invalid";
  return RESERVED.has(u.toLowerCase()) ? "reserved" : undefined;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function isRealDate(y: number, mo: number, d: number): boolean {
  if (y < 1900 || mo < 1 || mo > 12 || d < 1) return false;
  const dim = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function minAge(country: string): number {
  if (EU.has(country)) return 16;
  return country === "US" ? 13 : 18;
}

function ageOn(today: string, y: number, mo: number, d: number): number {
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7));
  const td = Number(today.slice(8, 10));
  const beforeBirthday = tm < mo || (tm === mo && td < d);
  return ty - y - (beforeBirthday ? 1 : 0);
}

function birthDateError(birth: string, today: string, country: string, countryErr: boolean): string | undefined {
  const m = typeof birth === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth) : null;
  if (!m) return "invalid_date";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isRealDate(y, mo, d) || birth > today) return "invalid_date";
  if (countryErr) return undefined;
  return ageOn(today, y, mo, d) < minAge(country) ? "too_young" : undefined;
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
    if (v !== undefined) errors[k] = v;
  };

  const emailErr = emailError(form.email);
  set("email", emailErr);
  set("password", passwordError(form.password, form.email, emailErr));
  set("username", usernameError(form.username));

  const countryOk = typeof form.country === "string" && /^[A-Z]{2}$/.test(form.country);
  if (!countryOk) errors.country = "invalid";

  set("birthDate", birthDateError(form.birthDate, today, form.country, !countryOk));
  set("referralCode", referralError(form.referralCode));
  if (form.acceptedTerms !== true) errors.acceptedTerms = "required";
  if (countryOk && EU.has(form.country) && typeof form.marketingConsent !== "boolean") {
    errors.marketingConsent = "required";
  }
  return errors;
}
