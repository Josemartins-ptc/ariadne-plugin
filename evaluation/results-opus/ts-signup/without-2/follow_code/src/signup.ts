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

const LOCAL_PART_RE = /^[A-Za-z0-9._%+-]{1,64}$/;
const DOMAIN_LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD_RE = /^[A-Za-z]{2,}$/;
const USERNAME_RE = /^[A-Za-z_][A-Za-z0-9_]{2,19}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const REFERRAL_RE = /^([A-Z])[A-Z]{2}-(\d)(\d)(\d)(\d)$/;
const PHONE_RE: Record<string, RegExp> = {
  US: /^\+1[2-9]\d{9}$/,
  PT: /^\+351\d{9}$/,
  DE: /^\+49\d{10,11}$/,
  GB: /^\+44\d{10}$/,
};
const DEFAULT_PHONE_RE = /^\+[1-9]\d{6,14}$/;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isValidEmail(email: string): boolean {
  if (email.length > 254) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!LOCAL_PART_RE.test(local)) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((label) => DOMAIN_LABEL_RE.test(label))) return false;
  return TLD_RE.test(labels[labels.length - 1]);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

type SimpleDate = { year: number; month: number; day: number };

function parseDate(value: string): SimpleDate | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function compareDates(a: SimpleDate, b: SimpleDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

function ageOn(birth: SimpleDate, today: SimpleDate): number {
  const beforeBirthday =
    today.month < birth.month || (today.month === birth.month && today.day < birth.day);
  return today.year - birth.year - (beforeBirthday ? 1 : 0);
}

function minimumAge(country: string): number {
  if (EU_COUNTRIES.has(country)) return 16;
  if (country === "US") return 13;
  return 18;
}

export function validateSignup(form: SignupForm, today: string): Record<string, string> {
  const errors: Record<string, string> = {};

  // email
  const email = str(form.email);
  if (email.trim() === "") {
    errors.email = "required";
  } else if (!isValidEmail(email)) {
    errors.email = "invalid";
  }

  // username (validated before the password, whose rules depend on it)
  const username = str(form.username);
  let usernameError: string | undefined;
  if (!USERNAME_RE.test(username)) {
    usernameError = "invalid";
  } else if (RESERVED_USERNAMES.has(username.toLowerCase())) {
    usernameError = "reserved";
  }

  // password
  const password = str(form.password);
  const localPart = errors.email ? "" : email.slice(0, email.indexOf("@"));
  if (Array.from(password).length < 10) {
    errors.password = "too_short";
  } else if (!/[A-Z]/.test(password)) {
    errors.password = "missing_upper";
  } else if (!/[a-z]/.test(password)) {
    errors.password = "missing_lower";
  } else if (!/[0-9]/.test(password)) {
    errors.password = "missing_digit";
  } else if (
    localPart.length >= 3 &&
    password.toLowerCase().includes(localPart.toLowerCase())
  ) {
    errors.password = "contains_email";
  } else if (!usernameError && password.toLowerCase().includes(username.toLowerCase())) {
    errors.password = "contains_username";
  }

  // username
  if (usernameError) {
    errors.username = usernameError;
  }

  // country
  const country = str(form.country);
  const countryValid = COUNTRY_RE.test(country);
  if (!countryValid) {
    errors.country = "invalid";
  }

  // phone
  if (countryValid && form.phone !== undefined && form.phone !== "") {
    const phoneRe = PHONE_RE[country] ?? DEFAULT_PHONE_RE;
    if (!phoneRe.test(str(form.phone))) {
      errors.phone = "invalid";
    }
  }

  // birthDate
  const birth = parseDate(str(form.birthDate));
  const now = parseDate(today)!;
  if (!birth || birth.year < 1900 || compareDates(birth, now) > 0) {
    errors.birthDate = "invalid_date";
  } else if (countryValid && ageOn(birth, now) < minimumAge(country)) {
    errors.birthDate = "too_young";
  }

  // referralCode
  if (form.referralCode !== undefined && form.referralCode !== "") {
    const match = REFERRAL_RE.exec(str(form.referralCode));
    if (!match) {
      errors.referralCode = "invalid_format";
    } else {
      const letterIndex = match[1].charCodeAt(0) - "A".charCodeAt(0);
      const digitSum = match.slice(2, 6).reduce((sum, d) => sum + Number(d), 0);
      if (digitSum % 7 !== letterIndex % 7) {
        errors.referralCode = "bad_checksum";
      }
    }
  }

  // acceptedTerms
  if (form.acceptedTerms !== true) {
    errors.acceptedTerms = "required";
  }

  // marketingConsent
  if (countryValid && EU_COUNTRIES.has(country) && typeof form.marketingConsent !== "boolean") {
    errors.marketingConsent = "required";
  }

  return errors;
}
