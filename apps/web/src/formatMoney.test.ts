import { describe, expect, it } from 'vitest';
import { formatMoney } from './formatMoney.js';

describe('exact money display', () => {
  it('formats Indian rupees with Indian digit grouping', () => {
    expect(formatMoney({ amount: '1895000.00', currency: 'INR' })).toBe('₹18,95,000.00');
  });

  it('formats zero-decimal currencies without appending a decimal fraction', () => {
    expect(formatMoney({ amount: '1250', currency: 'JPY' }, 'en-US')).toBe('¥1,250');
  });

  it('preserves the exact fractional digits near the safe-integer boundary', () => {
    expect(formatMoney({ amount: '90071992547409.91', currency: 'USD' }, 'en-US')).toBe(
      '$90,071,992,547,409.91'
    );
  });
});
