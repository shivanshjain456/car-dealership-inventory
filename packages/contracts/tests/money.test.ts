import { describe, expect, it } from 'vitest';
import { toMinorUnits, fromMinorUnits } from '../src/money.js';

describe('money conversion uses the ISO currency exponent', () => {
  it('converts a two-decimal currency without floating-point rounding', () => {
    expect(toMinorUnits('1234.56', 'USD')).toBe(123456);
  });

  it('supports zero-decimal currencies', () => {
    expect(toMinorUnits('1250', 'JPY')).toBe(1250);
    expect(fromMinorUnits(1250, 'JPY')).toBe('1250');
  });

  it('supports three-decimal currencies', () => {
    expect(toMinorUnits('1.234', 'KWD')).toBe(1234);
    expect(fromMinorUnits(1234, 'KWD')).toBe('1.234');
  });

  it('round-trips a two-decimal value as an ungrouped API decimal string', () => {
    expect(fromMinorUnits(123456, 'USD')).toBe('1234.56');
  });

  it('normalizes lower-case currency codes', () => {
    expect(toMinorUnits('9.99', 'usd')).toBe(999);
  });
});

describe('money conversion rejects ambiguous or unsafe values', () => {
  it.each(['1.001', '-1.00', '1e3', 'NaN', ' 1.00', ''])(
    'rejects invalid USD amount %j',
    (amount) => {
      expect(() => toMinorUnits(amount, 'USD')).toThrow();
    }
  );

  it('rejects fractional digits beyond the currency precision instead of rounding', () => {
    expect(() => toMinorUnits('1.234', 'USD')).toThrow();
    expect(() => toMinorUnits('1250.0', 'JPY')).toThrow();
  });

  it('rejects unsupported currency codes', () => {
    expect(() => toMinorUnits('10.00', 'ZZZ')).toThrow();
  });

  it('rejects values outside the safe integer range', () => {
    expect(() => toMinorUnits('90071992547409.92', 'USD')).toThrow();
  });

  it('rejects non-integer or unsafe minor-unit values when formatting', () => {
    expect(() => fromMinorUnits(1.5, 'USD')).toThrow();
    expect(() => fromMinorUnits(Number.MAX_SAFE_INTEGER + 1, 'USD')).toThrow();
  });
});
