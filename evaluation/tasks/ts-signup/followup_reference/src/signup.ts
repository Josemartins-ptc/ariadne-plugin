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
const RESERVED_USERNAMES = ["admin", "root", "support", "help"];

const LOCAL_PART = /^[A-Za-z0-9._%+-]{1,64}$/;
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD = /^[A-Za-z]{2,}$/;
const USERNAME = /^[A-Za-z_][A-Za-z0-9_]{2,19}$/;
const COUNTRY = /^[A-Z]{2}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const REFERRAL = /^[A-Z]{3}-\d{4}$/;
const PHONE_BY_COUNTRY: Record<string, RegExp> = {
  US: /^\+1[2-9]\d{9}$/,
  PT: /^\+351\d{9}$/,
  DE: /^\+49\d{10,11}$/,
  GB: /^\+44\d{10}$/,
};
const PHONE_OTHER = /^\+[1-9]\d{6,14}$/;

function isValidEmail(email: string): boolean {
  if (email.length > 254) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!LOCAL_PART.test(local)) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((label) => DOMAIN_LABEL.test(label))) return false;
  return TLD.test(labels[labels.length - 1]);
}

function emailError(email: string): string | undefined {
  if (email.trim() === "") return "required";
  return isValidEmail(email) ? undefined : "invalid";
}

function passwordError(
  password: string,
  email: string,
  emailOk: boolean,
  username: string,
  usernameOk: boolean,
): string | undefined {
  if (password.length < 10) return "too_short";
  if (!/[A-Z]/.test(password)) return "missing_upper";
  if (!/[a-z]/.test(password)) return "missing_lower";
  if (!/[0-9]/.test(password)) return "missing_digit";
  if (emailOk) {
    const local = email.split("@")[0];
    if (local.length >= 3 && password.toLowerCase().includes(local.toLowerCase())) {
      return "contains_email";
    }
  }
  if (usernameOk && password.toLowerCase().includes(username.toLowerCase())) {
    return "contains_username";
  }
  return undefined;
}

function usernameError(username: string): string | undefined {
  if (!USERNAME.test(username)) return "invalid";
  if (RESERVED_USERNAMES.includes(username.toLowerCase())) return "reserved";
  return undefined;
}

type Ymd = { year: number; month: number; day: number };

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDate(text: string): Ymd | undefined {
  const match = DATE.exec(text);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > daysInMonth(year, month)) return undefined;
  return { year, month, day };
}

function ageOn(birth: Ymd, today: Ymd): number {
  const beforeBirthday =
    today.month < birth.month || (today.month === birth.month && today.day < birth.day);
  return today.year - birth.year - (beforeBirthday ? 1 : 0);
}

function minimumAge(country: string): number {
  if (EU_COUNTRIES.has(country)) return 16;
  if (country === "US") return 13;
  return 18;
}

function birthDateError(birthDate: string, today: string, country: string, countryOk: boolean): string | undefined {
  const birth = parseDate(birthDate);
  if (!birth || birth.year < 1900 || birthDate > today) return "invalid_date";
  const now = parseDate(today) as Ymd;
  if (countryOk && ageOn(birth, now) < minimumAge(country)) return "too_young";
  return undefined;
}

function referralError(code: string | undefined): string | undefined {
  if (code === undefined || code === "") return undefined;
  if (!REFERRAL.test(code)) return "invalid_format";
  const digitSum = code.slice(4).split("").reduce((sum, d) => sum + Number(d), 0);
  const letterIndex = code.charCodeAt(0) - "A".charCodeAt(0);
  return digitSum % 7 === letterIndex % 7 ? undefined : "bad_checksum";
}

function phoneError(phone: string | undefined, country: string): string | undefined {
  if (phone === undefined || phone === "") return undefined;
  const pattern = PHONE_BY_COUNTRY[country] ?? PHONE_OTHER;
  return pattern.test(phone) ? undefined : "invalid";
}

export function validateSignup(form: SignupForm, today: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const set = (field: string, code: string | undefined) => {
    if (code !== undefined) errors[field] = code;
  };

  const emailCode = emailError(form.email);
  set("email", emailCode);
  const usernameCode = usernameError(form.username);
  set(
    "password",
    passwordError(form.password, form.email, emailCode === undefined, form.username, usernameCode === undefined),
  );
  set("username", usernameCode);

  const countryOk = COUNTRY.test(form.country);
  if (!countryOk) set("country", "invalid");
  set("birthDate", birthDateError(form.birthDate, today, form.country, countryOk));
  set("referralCode", referralError(form.referralCode));
  if (form.acceptedTerms !== true) set("acceptedTerms", "required");
  if (countryOk && EU_COUNTRIES.has(form.country) && typeof form.marketingConsent !== "boolean") {
    set("marketingConsent", "required");
  }
  if (countryOk) set("phone", phoneError(form.phone, form.country));
  return errors;
}
