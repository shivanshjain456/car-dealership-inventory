import type { MoneyInput } from '@motorline/contracts';

const DECIMAL_AMOUNT = /^(\d+)(?:\.(\d+))?$/;

export function formatMoney(money: MoneyInput, locale = 'en-IN'): string {
  const match = DECIMAL_AMOUNT.exec(money.amount);
  if (!match) throw new TypeError('Money amount must be a non-negative decimal string.');

  const [, wholePart, fractionPart = ''] = match;
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits;
  if (typeof fractionDigits !== 'number')
    throw new TypeError('Could not determine the currency precision.');
  if (fractionPart.length > fractionDigits) {
    throw new RangeError('Money amount exceeds the currency precision.');
  }

  const exactFraction = fractionPart.padEnd(fractionDigits, '0');
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).formatToParts(BigInt(wholePart!));

  return parts.map((part) => (part.type === 'fraction' ? exactFraction : part.value)).join('');
}
