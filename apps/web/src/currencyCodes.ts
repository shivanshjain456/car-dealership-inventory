const PRIORITY_CURRENCIES = ['INR', 'USD', 'EUR', 'JPY', 'KWD'];
const supportedCurrencies =
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('currency')
    : PRIORITY_CURRENCIES;

export const currencyCodes = [...new Set([...PRIORITY_CURRENCIES, ...supportedCurrencies])];

export function currencyLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'currency' }).of(code);
    return name ? `${code} — ${name}` : code;
  } catch {
    return code;
  }
}
