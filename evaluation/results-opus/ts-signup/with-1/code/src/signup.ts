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
const REFERRAL_RE = /^([A-Z])[A-Z]{2}-(\d{4})$/;

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
  return isValidLocalPart(local) && isValidDomain(domain) ? undefined : "invalid";
}

function validatePassword(password: string, emailLocal: string | undefined): string | undefined {
  if (password.length < 10) return "too_short";
  if (!/[A-Z]/.test(password)) return "missing_upper";
  if (!/[a-z]/.test(password)) return "missing_lower";
  if (!/[0-9]/.test(password)) return "missing_digit";
  if (emailLocal !== undefined && emailLocal.length >= 3 &&
      password.toLowerCase().includes(emailLocal.toLowerCase())) {
    return "contains_email";
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

type YMD = { year: number; month: number; day: number };

function parseDate(value: string): YMD | undefined {
  const match = DATE_RE.exec(value);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return undefined;
  return { year, month, day };
}

function ageOn(birth: YMD, today: YMD): number {
  const beforeBirthday =
    today.month < birth.month || (today.month === birth.month && today.day < birth.day);
  return today.year - birth.year - (beforeBirthday ? 1 : 0);
}

function minimumAge(country: string): number {
  if (EU_COUNTRIES.has(country)) return 16;
  return country === "US" ? 13 : 18;
}

function validateBirthDate(
  birthDate: string,
  today: string,
  country: string | undefined,
): string | undefined {
  const birth = parseDate(birthDate);
  if (!birth || birth.year < 1900 || birthDate > today) return "invalid_date";
  if (country === undefined) return undefined;
  return ageOn(birth, parseDate(today)!) < minimumAge(country) ? "too_young" : undefined;
}

function validateReferralCode(code: string | undefined): string | undefined {
  if (code === undefined || code === "") return undefined;
  const match = REFERRAL_RE.exec(code);
  if (!match) return "invalid_format";
  const letterIndex = match[1].charCodeAt(0) - "A".charCodeAt(0);
  const digitSum = [...match[2]].reduce((sum, d) => sum + Number(d), 0);
  return digitSum % 7 === letterIndex % 7 ? undefined : "bad_checksum";
}

export function validateSignup(form: SignupForm, today: string): Record<string, string> {
  const emailError = validateEmail(form.email);
  const emailLocal = emailError ? undefined : form.email.split("@")[0];
  const countryError = COUNTRY_RE.test(form.country) ? undefined : "invalid";
  const validCountry = countryError ? undefined : form.country;
  const needsConsent = validCountry !== undefined && EU_COUNTRIES.has(validCountry);

  const results: Record<string, string | undefined> = {
    email: emailError,
    password: validatePassword(form.password, emailLocal),
    username: validateUsername(form.username),
    birthDate: validateBirthDate(form.birthDate, today, validCountry),
    country: countryError,
    referralCode: validateReferralCode(form.referralCode),
    acceptedTerms: form.acceptedTerms === true ? undefined : "required",
    marketingConsent:
      needsConsent && typeof form.marketingConsent !== "boolean" ? "required" : undefined,
  };

  const errors: Record<string, string> = {};
  for (const [field, error] of Object.entries(results)) {
    if (error !== undefined) errors[field] = error;
  }
  return errors;
}
