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

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

const RESERVED_USERNAMES = new Set(["admin", "root", "support", "help"]);

// Lowercases ASCII letters only, so non-ASCII characters never fold into ASCII ones.
function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

function isValidEmail(email: string): boolean {
  if (email.length > 254) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;

  if (local.length < 1 || local.length > 64) return false;
  if (!/^[A-Za-z0-9._%+-]+$/.test(local)) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;

  const labels = domain.split(".");
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (label.length < 1 || label.length > 63) return false;
    if (!/^[A-Za-z0-9-]+$/.test(label)) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
  }
  const tld = labels[labels.length - 1];
  return tld.length >= 2 && /^[A-Za-z]+$/.test(tld);
}

function validateEmail(email: string): string | undefined {
  if (/^\s*$/.test(email)) return "required";
  if (!isValidEmail(email)) return "invalid";
  return undefined;
}

function validatePassword(
  password: string,
  email: string,
  emailOk: boolean,
  username: string,
  usernameOk: boolean,
): string | undefined {
  if (Array.from(password).length < 10) return "too_short";
  if (!/[A-Z]/.test(password)) return "missing_upper";
  if (!/[a-z]/.test(password)) return "missing_lower";
  if (!/[0-9]/.test(password)) return "missing_digit";
  if (emailOk) {
    const local = email.slice(0, email.indexOf("@"));
    if (local.length >= 3 && asciiLower(password).includes(asciiLower(local))) {
      return "contains_email";
    }
  }
  if (usernameOk && asciiLower(password).includes(asciiLower(username))) return "contains_username";
  return undefined;
}

function validateUsername(username: string): string | undefined {
  if (!/^[A-Za-z_][A-Za-z0-9_]{2,19}$/.test(username)) return "invalid";
  if (RESERVED_USERNAMES.has(asciiLower(username))) return "reserved";
  return undefined;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDate(s: string): { year: number; month: number; day: number } | undefined {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > daysInMonth(year, month)) return undefined;
  return { year, month, day };
}

function minimumAge(country: string): number {
  if (EU_COUNTRIES.has(country)) return 16;
  if (country === "US") return 13;
  return 18;
}

function validateBirthDate(birthDate: string, today: string, country: string, countryOk: boolean): string | undefined {
  const birth = parseDate(birthDate);
  if (!birth || birth.year < 1900) return "invalid_date";
  const now = parseDate(today)!;
  // Both are zero-padded YYYY-MM-DD, so string comparison orders them chronologically.
  if (birthDate > today) return "invalid_date";
  if (!countryOk) return undefined;

  let age = now.year - birth.year;
  if (now.month < birth.month || (now.month === birth.month && now.day < birth.day)) age--;
  if (age < minimumAge(country)) return "too_young";
  return undefined;
}

function validateReferralCode(code: string | undefined): string | undefined {
  if (code === undefined || code === "") return undefined;
  const m = /^([A-Z])[A-Z]{2}-([0-9]{4})$/.exec(code);
  if (!m) return "invalid_format";
  const letterPos = m[1].charCodeAt(0) - 65;
  const digitSum = Array.from(m[2]).reduce((sum, d) => sum + Number(d), 0);
  if (digitSum % 7 !== letterPos % 7) return "bad_checksum";
  return undefined;
}

const PHONE_RULES: Record<string, RegExp> = {
  US: /^\+1[2-9][0-9]{9}$/,
  PT: /^\+351[0-9]{9}$/,
  DE: /^\+49[0-9]{10,11}$/,
  GB: /^\+44[0-9]{10}$/,
};

function validatePhone(phone: string | undefined, country: string, countryOk: boolean): string | undefined {
  if (phone === undefined || phone === "" || !countryOk) return undefined;
  const rule = PHONE_RULES[country] ?? /^\+[1-9][0-9]{6,14}$/;
  return rule.test(phone) ? undefined : "invalid";
}

export function validateSignup(form: SignupForm, today: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const set = (field: string, code: string | undefined) => {
    if (code !== undefined) errors[field] = code;
  };

  const emailError = validateEmail(form.email);
  set("email", emailError);
  const usernameError = validateUsername(form.username);
  set(
    "password",
    validatePassword(form.password, form.email, emailError === undefined, form.username, usernameError === undefined),
  );
  set("username", usernameError);

  const countryOk = /^[A-Z]{2}$/.test(form.country);
  if (!countryOk) set("country", "invalid");

  set("birthDate", validateBirthDate(form.birthDate, today, form.country, countryOk));
  set("referralCode", validateReferralCode(form.referralCode));
  set("phone", validatePhone(form.phone, form.country, countryOk));
  if (form.acceptedTerms !== true) set("acceptedTerms", "required");
  if (countryOk && EU_COUNTRIES.has(form.country) && typeof form.marketingConsent !== "boolean") {
    set("marketingConsent", "required");
  }

  return errors;
}
