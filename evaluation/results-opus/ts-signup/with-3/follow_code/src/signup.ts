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
const PHONE_RE = /^\+\d+$/;
const PHONE_RULES: Record<string, RegExp> = {
  US: /^\+1[2-9]\d{9}$/,
  PT: /^\+351\d{9}$/,
  DE: /^\+49\d{10,11}$/,
  GB: /^\+44\d{10}$/,
};
const DEFAULT_PHONE_RE = /^\+[1-9]\d{6,14}$/;

type Errors = Record<string, string>;

function isValidLocalPart(local: string): boolean {
  return (
    LOCAL_PART_RE.test(local) &&
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    !local.includes("..")
  );
}

function isValidDomain(domain: string): boolean {
  const labels = domain.split(".");
  return (
    labels.length >= 2 &&
    labels.every((label) => DOMAIN_LABEL_RE.test(label)) &&
    TLD_RE.test(labels[labels.length - 1])
  );
}

function validateEmail(email: string): string | undefined {
  if (email.trim() === "") return "required";
  if (email.length > 254) return "invalid";
  const parts = email.split("@");
  if (parts.length !== 2) return "invalid";
  const [local, domain] = parts;
  if (!isValidLocalPart(local) || !isValidDomain(domain)) return "invalid";
  return undefined;
}

function validatePassword(
  password: string,
  emailLocalPart: string | undefined,
  username: string | undefined,
): string | undefined {
  if (password.length < 10) return "too_short";
  if (!/[A-Z]/.test(password)) return "missing_upper";
  if (!/[a-z]/.test(password)) return "missing_lower";
  if (!/[0-9]/.test(password)) return "missing_digit";
  if (
    emailLocalPart !== undefined &&
    emailLocalPart.length >= 3 &&
    password.toLowerCase().includes(emailLocalPart.toLowerCase())
  ) {
    return "contains_email";
  }
  if (username !== undefined && password.toLowerCase().includes(username.toLowerCase())) {
    return "contains_username";
  }
  return undefined;
}

function validateUsername(username: string): string | undefined {
  if (!USERNAME_RE.test(username)) return "invalid";
  if (RESERVED_USERNAMES.has(username.toLowerCase())) return "reserved";
  return undefined;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

type DateParts = { year: number; month: number; day: number };

function parseDate(value: string): DateParts | undefined {
  const match = DATE_RE.exec(value);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > daysInMonth(year, month)) return undefined;
  return { year, month, day };
}

function ageOn(birth: DateParts, today: DateParts): number {
  const beforeBirthday =
    today.month < birth.month || (today.month === birth.month && today.day < birth.day);
  return today.year - birth.year - (beforeBirthday ? 1 : 0);
}

function minimumAge(country: string): number {
  if (EU_COUNTRIES.has(country)) return 16;
  if (country === "US") return 13;
  return 18;
}

function validateBirthDate(birthDate: string, today: string, country: string | undefined): string | undefined {
  const birth = parseDate(birthDate);
  // Valid YYYY-MM-DD strings compare chronologically as plain strings.
  if (!birth || birth.year < 1900 || birthDate > today) return "invalid_date";
  if (country !== undefined && ageOn(birth, parseDate(today)!) < minimumAge(country)) {
    return "too_young";
  }
  return undefined;
}

function validateReferralCode(code: string | undefined): string | undefined {
  if (code === undefined || code === "") return undefined;
  const match = REFERRAL_RE.exec(code);
  if (!match) return "invalid_format";
  const letterPosition = match[1].charCodeAt(0) - "A".charCodeAt(0);
  const digitSum = match.slice(2).reduce((sum, digit) => sum + Number(digit), 0);
  return digitSum % 7 === letterPosition % 7 ? undefined : "bad_checksum";
}

function validatePhone(phone: string | undefined, country: string): string | undefined {
  if (phone === undefined || phone === "") return undefined;
  if (!PHONE_RE.test(phone)) return "invalid";
  const rule = PHONE_RULES[country] ?? DEFAULT_PHONE_RE;
  return rule.test(phone) ? undefined : "invalid";
}

function setError(errors: Errors, field: string, code: string | undefined): void {
  if (code !== undefined) errors[field] = code;
}

export function validateSignup(form: SignupForm, today: string): Record<string, string> {
  const errors: Errors = {};

  const emailError = validateEmail(form.email);
  setError(errors, "email", emailError);
  const emailLocalPart = emailError ? undefined : form.email.split("@")[0];
  const usernameError = validateUsername(form.username);
  const validUsername = usernameError ? undefined : form.username;
  setError(errors, "password", validatePassword(form.password, emailLocalPart, validUsername));

  setError(errors, "username", usernameError);

  const countryValid = COUNTRY_RE.test(form.country);
  setError(errors, "country", countryValid ? undefined : "invalid");
  const validCountry = countryValid ? form.country : undefined;

  setError(errors, "birthDate", validateBirthDate(form.birthDate, today, validCountry));
  if (validCountry !== undefined) {
    setError(errors, "phone", validatePhone(form.phone, validCountry));
  }
  setError(errors, "referralCode", validateReferralCode(form.referralCode));
  setError(errors, "acceptedTerms", form.acceptedTerms === true ? undefined : "required");

  if (validCountry !== undefined && EU_COUNTRIES.has(validCountry)) {
    setError(errors, "marketingConsent", typeof form.marketingConsent === "boolean" ? undefined : "required");
  }

  return errors;
}
