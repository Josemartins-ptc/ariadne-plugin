export type SignupForm = {
  email: string;
  password: string;
  username: string;
  birthDate: string; // YYYY-MM-DD
  country: string; // ISO 3166-1 alpha-2, e.g. "PT"
  referralCode?: string;
  phone?: string;
  acceptedTerms: boolean;
  marketingConsent?: boolean;
};

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

const RESERVED_USERNAMES = new Set(["admin", "root", "support", "help"]);

const LOCAL_PART_RE = /^[A-Za-z0-9._%+-]+$/;
const DOMAIN_LABEL_RE = /^[A-Za-z0-9-]+$/;
const TLD_RE = /^[A-Za-z]+$/;

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function validateEmail(email: string | undefined): string | undefined {
  if (email === undefined || /^\s*$/.test(email)) return "required";
  if (email.length > 254) return "invalid";

  const parts = email.split("@");
  if (parts.length !== 2) return "invalid";
  const [local, domain] = parts;

  if (local.length < 1 || local.length > 64) return "invalid";
  if (!LOCAL_PART_RE.test(local)) return "invalid";
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return "invalid";

  const labels = domain.split(".");
  if (labels.length < 2) return "invalid";
  for (const label of labels) {
    if (label.length < 1 || label.length > 63) return "invalid";
    if (!DOMAIN_LABEL_RE.test(label)) return "invalid";
    if (label.startsWith("-") || label.endsWith("-")) return "invalid";
  }
  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !TLD_RE.test(tld)) return "invalid";

  return undefined;
}

function validatePassword(
  password: string | undefined,
  emailLocalPart: string | undefined,
  username: string | undefined,
): string | undefined {
  const pw = password ?? "";
  if ([...pw].length < 10) return "too_short";
  if (!/[A-Z]/.test(pw)) return "missing_upper";
  if (!/[a-z]/.test(pw)) return "missing_lower";
  if (!/[0-9]/.test(pw)) return "missing_digit";
  if (emailLocalPart !== undefined && emailLocalPart.length >= 3) {
    // The local part is ASCII-only once the email is valid, so ASCII lowercasing is enough.
    if (pw.toLowerCase().includes(emailLocalPart.toLowerCase())) return "contains_email";
  }
  // A valid username is ASCII-only, so ASCII lowercasing is enough.
  if (username !== undefined && pw.toLowerCase().includes(username.toLowerCase())) return "contains_username";
  return undefined;
}

function validateUsername(username: string | undefined): string | undefined {
  if (username === undefined || !/^[A-Za-z_][A-Za-z0-9_]{2,19}$/.test(username)) return "invalid";
  if (RESERVED_USERNAMES.has(username.toLowerCase())) return "reserved";
  return undefined;
}

function validateCountry(country: string | undefined): string | undefined {
  return country !== undefined && /^[A-Z]{2}$/.test(country) ? undefined : "invalid";
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

type YMD = { year: number; month: number; day: number };

function parseDate(value: string): YMD {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

function minimumAge(country: string): number {
  if (EU_COUNTRIES.has(country)) return 16;
  if (country === "US") return 13;
  return 18;
}

function validateBirthDate(birthDate: string | undefined, today: string, country: string | undefined): string | undefined {
  if (birthDate === undefined || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(birthDate)) return "invalid_date";
  const birth = parseDate(birthDate);
  if (birth.year < 1900) return "invalid_date";
  if (birth.month < 1 || birth.month > 12) return "invalid_date";
  if (birth.day < 1 || birth.day > daysInMonth(birth.year, birth.month)) return "invalid_date";
  // Both strings are zero-padded YYYY-MM-DD, so lexicographic order is chronological order.
  if (birthDate > today) return "invalid_date";

  if (country === undefined) return undefined; // country has an error: skip the age check

  const now = parseDate(today);
  let age = now.year - birth.year;
  if (now.month < birth.month || (now.month === birth.month && now.day < birth.day)) age -= 1;
  if (age < minimumAge(country)) return "too_young";
  return undefined;
}

function validateReferralCode(code: string | undefined): string | undefined {
  if (code === undefined || code === "") return undefined;
  if (!/^[A-Z]{3}-[0-9]{4}$/.test(code)) return "invalid_format";
  const letterPosition = code.charCodeAt(0) - "A".charCodeAt(0);
  const digitSum = [...code.slice(4)].reduce((sum, d) => sum + Number(d), 0);
  return digitSum % 7 === letterPosition % 7 ? undefined : "bad_checksum";
}

const PHONE_RULES: Record<string, RegExp> = {
  US: /^\+1[2-9][0-9]{9}$/,
  PT: /^\+351[0-9]{9}$/,
  DE: /^\+49[0-9]{10,11}$/,
  GB: /^\+44[0-9]{10}$/,
};
const DEFAULT_PHONE_RE = /^\+[1-9][0-9]{6,14}$/;

function validatePhone(phone: string | undefined, country: string): string | undefined {
  if (phone === undefined || phone === "") return undefined;
  return (PHONE_RULES[country] ?? DEFAULT_PHONE_RE).test(phone) ? undefined : "invalid";
}

export function validateSignup(form: SignupForm, today: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const set = (field: string, error: string | undefined) => {
    if (error !== undefined) errors[field] = error;
  };

  const email = str(form.email);
  const emailError = validateEmail(email);
  set("email", emailError);
  const emailLocalPart = emailError === undefined ? email!.split("@")[0] : undefined;

  const countryRaw = str(form.country);
  const countryError = validateCountry(countryRaw);
  set("country", countryError);
  const country = countryError === undefined ? countryRaw : undefined;

  const usernameRaw = str(form.username);
  const usernameError = validateUsername(usernameRaw);
  const username = usernameError === undefined ? usernameRaw : undefined;

  set("password", validatePassword(str(form.password), emailLocalPart, username));
  set("username", usernameError);
  set("birthDate", validateBirthDate(str(form.birthDate), today, country));

  const referral: unknown = form.referralCode;
  set(
    "referralCode",
    referral === undefined || typeof referral === "string" ? validateReferralCode(referral) : "invalid_format",
  );

  const phone: unknown = form.phone;
  if (country !== undefined) {
    set("phone", phone === undefined || typeof phone === "string" ? validatePhone(phone, country) : "invalid");
  }

  set("acceptedTerms", form.acceptedTerms === true ? undefined : "required");

  if (country !== undefined && EU_COUNTRIES.has(country) && typeof form.marketingConsent !== "boolean") {
    errors.marketingConsent = "required";
  }

  return errors;
}
