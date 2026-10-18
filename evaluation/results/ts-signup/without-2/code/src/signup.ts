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

// Returns the local part when the email is valid, otherwise null.
function emailLocalPart(email: string): string | null {
  if (email.length > 254) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (local.length < 1 || local.length > 64) return null;
  if (!/^[A-Za-z0-9._%+-]+$/.test(local)) return null;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  const labels = domain.split(".");
  if (labels.length < 2) return null;
  for (const l of labels) {
    if (l.length < 1 || l.length > 63) return null;
    if (!/^[A-Za-z0-9-]+$/.test(l)) return null;
    if (l.startsWith("-") || l.endsWith("-")) return null;
  }
  if (!/^[A-Za-z]{2,}$/.test(labels[labels.length - 1])) return null;
  return local;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function parseDate(s: string): [number, number, number] | null {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < 1900 || m < 1 || m > 12 || d < 1) return null;
  const dim = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (d > dim) return null;
  return [y, m, d];
}

export function validateSignup(form: SignupForm, today: string): Record<string, string> {
  const errors: Record<string, string> = {};

  // email
  const email = typeof form.email === "string" ? form.email : "";
  const local = emailLocalPart(email);
  if (email.trim() === "") errors.email = "required";
  else if (local === null) errors.email = "invalid";

  // password
  const pw = typeof form.password === "string" ? form.password : "";
  if (pw.length < 10) errors.password = "too_short";
  else if (!/[A-Z]/.test(pw)) errors.password = "missing_upper";
  else if (!/[a-z]/.test(pw)) errors.password = "missing_lower";
  else if (!/[0-9]/.test(pw)) errors.password = "missing_digit";
  else if (local !== null && local.length >= 3 && pw.toLowerCase().includes(local.toLowerCase())) {
    errors.password = "contains_email";
  }

  // username
  const user = typeof form.username === "string" ? form.username : "";
  if (!/^[A-Za-z_][A-Za-z0-9_]{2,19}$/.test(user)) errors.username = "invalid";
  else if (RESERVED.has(user.toLowerCase())) errors.username = "reserved";

  // country
  const country = typeof form.country === "string" ? form.country : "";
  const countryOk = /^[A-Z]{2}$/.test(country);
  if (!countryOk) errors.country = "invalid";
  const isEU = countryOk && EU.has(country);

  // birthDate
  const birthDate = typeof form.birthDate === "string" ? form.birthDate : "";
  const bd = parseDate(birthDate);
  if (bd === null || birthDate > today) {
    errors.birthDate = "invalid_date";
  } else if (countryOk) {
    const t = parseDate(today)!;
    let age = t[0] - bd[0];
    if (t[1] < bd[1] || (t[1] === bd[1] && t[2] < bd[2])) age--;
    const min = isEU ? 16 : country === "US" ? 13 : 18;
    if (age < min) errors.birthDate = "too_young";
  }

  // referralCode
  const ref = form.referralCode;
  if (ref !== undefined && ref !== "") {
    if (typeof ref !== "string" || !/^[A-Z]{3}-[0-9]{4}$/.test(ref)) {
      errors.referralCode = "invalid_format";
    } else {
      const sum = [...ref.slice(4)].reduce((a, c) => a + Number(c), 0);
      if (sum % 7 !== (ref.charCodeAt(0) - 65) % 7) errors.referralCode = "bad_checksum";
    }
  }

  // acceptedTerms
  if (form.acceptedTerms !== true) errors.acceptedTerms = "required";

  // marketingConsent
  if (isEU && typeof form.marketingConsent !== "boolean") errors.marketingConsent = "required";

  return errors;
}
