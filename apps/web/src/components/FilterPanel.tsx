import { useState, type FormEvent } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { currencyCodes, currencyLabel } from '../currencyCodes.js';

export interface VehicleFilters {
  q: string;
  make: string;
  model: string;
  category: string;
  minPrice: string;
  maxPrice: string;
  currency: string;
}

interface FilterPanelProps {
  filters: VehicleFilters;
  setFilters: Dispatch<SetStateAction<VehicleFilters>>;
  onApply(filters: VehicleFilters): void;
  onReset(): void;
  busy: boolean;
}

export const EMPTY_FILTERS: VehicleFilters = {
  q: '',
  make: '',
  model: '',
  category: '',
  minPrice: '',
  maxPrice: '',
  currency: ''
};

export default function FilterPanel({
  filters,
  setFilters,
  onApply,
  onReset,
  busy
}: FilterPanelProps) {
  const [open, setOpen] = useState(false);

  function update(field: keyof VehicleFilters, value: string) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply(filters);
    setOpen(false);
  }

  return (
    <aside className={`filter-panel${open ? ' filters-open' : ''}`} aria-label="Vehicle filters">
      <div className="filter-heading-row">
        <div>
          <p className="eyebrow filter-eyebrow">NARROW THE FIELD</p>
          <h2>Find your fit</h2>
        </div>
        <button
          className="filter-mobile-toggle"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? 'Close' : 'Filters'}
        </button>
      </div>

      <form className="filter-fields" onSubmit={submit}>
        <label className="field-label" htmlFor="filter-q">
          Search the collection
        </label>
        <div className="search-input-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            id="filter-q"
            type="search"
            value={filters.q}
            onChange={(event) => update('q', event.target.value)}
            placeholder="Make, model, category…"
          />
        </div>

        <div className="filter-divider">
          <span>DETAILS</span>
        </div>
        <div className="filter-two-col">
          <div>
            <label className="field-label" htmlFor="filter-make">
              Make
            </label>
            <input
              id="filter-make"
              value={filters.make}
              onChange={(event) => update('make', event.target.value)}
              placeholder="Any make"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="filter-model">
              Model
            </label>
            <input
              id="filter-model"
              value={filters.model}
              onChange={(event) => update('model', event.target.value)}
              placeholder="Any model"
            />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="filter-category">
            Category
          </label>
          <input
            id="filter-category"
            value={filters.category}
            onChange={(event) => update('category', event.target.value)}
            placeholder="Any category"
          />
        </div>

        <div className="filter-divider">
          <span>PRICE RANGE</span>
        </div>
        <div className="filter-two-col filter-price-fields">
          <div>
            <label className="field-label" htmlFor="filter-min-price">
              Minimum price
            </label>
            <input
              id="filter-min-price"
              inputMode="decimal"
              value={filters.minPrice}
              onChange={(event) => update('minPrice', event.target.value)}
              placeholder="No minimum"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="filter-max-price">
              Maximum price
            </label>
            <input
              id="filter-max-price"
              inputMode="decimal"
              value={filters.maxPrice}
              onChange={(event) => update('maxPrice', event.target.value)}
              placeholder="No maximum"
            />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="filter-currency">
            Currency
          </label>
          <select
            id="filter-currency"
            value={filters.currency}
            onChange={(event) => update('currency', event.target.value)}
          >
            <option value="">Choose when using price</option>
            {currencyCodes.map((code) => (
              <option key={code} value={code}>
                {currencyLabel(code)}
              </option>
            ))}
          </select>
          <p className="field-note">Price ranges compare like currencies only.</p>
        </div>

        <div className="filter-actions">
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? 'Searching…' : 'Apply filters'}
            <span aria-hidden="true">↗</span>
          </button>
          <button
            className="quiet-button reset-button"
            type="button"
            onClick={onReset}
            disabled={busy}
          >
            Reset filters
          </button>
        </div>
      </form>
    </aside>
  );
}
