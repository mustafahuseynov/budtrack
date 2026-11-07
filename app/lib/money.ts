export const CURRENCY = "EUR";
const LOCALE = "en-IE";

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const signedCurrencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

/** Formats integer minor units (cents) as a currency string. */
export function formatCents(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

/** Formats cents with an explicit +/- sign, useful for balances. */
export function formatSignedCents(cents: number): string {
  return signedCurrencyFormatter.format(cents / 100);
}

/** Renders cents the way an amount input expects it, e.g. 1234 -> "12.34". */
export function centsToInputValue(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || cents === 0) return "";
  return (cents / 100).toFixed(2);
}

/**
 * Cleans a partially typed amount so it only ever contains digits and a single
 * decimal separator with at most two fractional digits. Typing a third decimal
 * digit is ignored instead of being accepted and rejected later.
 */
export function sanitizeAmountInput(raw: string): string {
  const value = raw.replace(/[\s\u00a0\u202f€]/g, "").replace(/[^\d.,]/g, "");
  if (value === "") return "";

  const lastDot = value.lastIndexOf(".");
  const lastComma = value.lastIndexOf(",");
  const separatorIndex = Math.max(lastDot, lastComma);

  if (separatorIndex === -1) {
    return value.replace(/^0+(?=\d)/, "");
  }

  const integerPart =
    value
      .slice(0, separatorIndex)
      .replace(/[.,]/g, "")
      .replace(/^0+(?=\d)/, "") || "0";
  const fractionPart = value
    .slice(separatorIndex + 1)
    .replace(/[.,]/g, "")
    .slice(0, 2);

  return `${integerPart}.${fractionPart}`;
}

/**
 * Normalizes an amount input on blur, e.g. "12.5" -> "12.50", "1,5" -> "1.50".
 * A blank or zero value stays blank so clearing a cell removes its plan.
 */
export function normalizeAmountInput(raw: string): string {
  const sanitized = sanitizeAmountInput(raw);
  const parseable = sanitized.endsWith(".") ? sanitized.slice(0, -1) : sanitized;
  const cents = parseAmountToCents(parseable);
  if (cents === null) return sanitized;
  if (cents === 0) return "";
  return (cents / 100).toFixed(2);
}

/**
 * Parses a user-entered amount into integer cents.
 * Accepts "1234.56", "1 234,56", "€12", and returns 0 for a blank value.
 * Returns null when the value is not a valid amount.
 */
export function parseAmountToCents(raw: string): number | null {
  const value = raw.trim().replace(/[\s\u00a0\u202f€]/g, "");
  if (value === "") return 0;

  let normalized = value;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/,/g, "");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const cents = Math.round(Number(normalized) * 100);
  return Number.isFinite(cents) ? cents : null;
}
