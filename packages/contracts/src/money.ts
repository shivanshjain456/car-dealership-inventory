const DECIMAL_AMOUNT = /^\d+(?:\.(\d+))?$/;
const MAX_SAFE_MINOR_UNITS = BigInt(Number.MAX_SAFE_INTEGER);
const ISO_CURRENCY_CODES = new Set(Intl.supportedValuesOf('currency'));

function normalizedCurrency(currency: string): string {
  const normalized = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new TypeError('Currency must be a three-letter ISO code.');
  }

  if (!ISO_CURRENCY_CODES.has(normalized)) {
    throw new TypeError('Currency code is not a supported ISO currency.');
  }

  return normalized;
}

export function isCurrencyCode(currency: string): boolean {
  return typeof currency === 'string' && ISO_CURRENCY_CODES.has(currency.toUpperCase());
}

function fractionDigits(currency: string): number {
  const digits = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: normalizedCurrency(currency)
  }).resolvedOptions().maximumFractionDigits;

  if (typeof digits !== 'number' || !Number.isInteger(digits) || digits < 0) {
    throw new TypeError('Could not determine the ISO currency precision.');
  }
  return digits;
}

export function toMinorUnits(amount: string, currency: string): number {
  if (typeof amount !== 'string') {
    throw new TypeError('Amount must be supplied as a decimal string.');
  }

  const match = DECIMAL_AMOUNT.exec(amount);
  if (!match) {
    throw new TypeError(
      'Amount must be a non-negative decimal without grouping or exponent notation.'
    );
  }

  const scale = fractionDigits(currency);
  const [, fractionalPart] = match;
  if ((fractionalPart?.length ?? 0) > scale) {
    throw new RangeError(
      `Amount has more than ${scale} fractional digits for ${currency.toUpperCase()}.`
    );
  }

  const [wholePart, fractionPart = ''] = amount.split('.');
  const factor = 10n ** BigInt(scale);
  const whole = BigInt(wholePart!);
  const fraction = BigInt(fractionPart.padEnd(scale, '0') || '0');
  const minorUnits = whole * factor + fraction;

  if (minorUnits > MAX_SAFE_MINOR_UNITS) {
    throw new RangeError('Amount exceeds the supported safe integer range.');
  }

  return Number(minorUnits);
}

export function fromMinorUnits(amountMinor: number, currency: string): string {
  const scale = fractionDigits(currency);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new TypeError('Minor-unit amount must be a non-negative safe integer.');
  }

  const minor = BigInt(amountMinor);
  const factor = 10n ** BigInt(scale);
  const whole = minor / factor;
  if (scale === 0) return whole.toString();

  const fraction = (minor % factor).toString().padStart(scale, '0');
  return `${whole}.${fraction}`;
}
