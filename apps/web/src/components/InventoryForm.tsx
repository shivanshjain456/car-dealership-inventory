import { useState, type FormEvent } from 'react';
import { vehicleInputSchema, type VehicleDto, type VehicleInput } from '@motorline/contracts';
import { currencyCodes, currencyLabel } from '../currencyCodes.js';

interface InventoryFormProps {
  vehicle?: VehicleDto;
  busy: boolean;
  serverError?: string;
  onSave(input: VehicleInput): void;
  onCancel(): void;
}

export default function InventoryForm({
  vehicle,
  busy,
  serverError,
  onSave,
  onCancel
}: InventoryFormProps) {
  const [make, setMake] = useState(vehicle?.make ?? '');
  const [model, setModel] = useState(vehicle?.model ?? '');
  const [category, setCategory] = useState(vehicle?.category ?? '');
  const [amount, setAmount] = useState(vehicle?.price.amount ?? '');
  const [currency, setCurrency] = useState(vehicle?.price.currency ?? 'INR');
  const [quantity, setQuantity] = useState(String(vehicle?.quantity ?? 0));
  const [formError, setFormError] = useState('');
  const editing = Boolean(vehicle);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const result = vehicleInputSchema.safeParse({
      make,
      model,
      category,
      price: { amount, currency },
      quantity: Number(quantity)
    });
    if (!result.success) {
      setFormError(result.error.issues[0]?.message ?? 'Check the vehicle details and try again.');
      return;
    }
    onSave(result.data);
  }

  return (
    <section className="inventory-form-panel" aria-labelledby="inventory-form-heading">
      <div className="form-panel-heading">
        <div>
          <p className="eyebrow">
            <span className="eyebrow-rule" /> ADMIN / INVENTORY
          </p>
          <h2 id="inventory-form-heading">{editing ? 'Edit vehicle details' : 'Add a vehicle'}</h2>
          <p>
            {editing
              ? 'Replace the current details and stock count.'
              : 'Add a considered choice to the collection.'}
          </p>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onCancel}
          aria-label="Close vehicle form"
        >
          ×
        </button>
      </div>

      <form className="inventory-form" onSubmit={submit}>
        <div className="form-grid">
          <div>
            <label className="field-label" htmlFor="vehicle-make">
              Make
            </label>
            <input
              id="vehicle-make"
              value={make}
              onChange={(event) => setMake(event.target.value)}
              required
              maxLength={80}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="vehicle-model">
              Model
            </label>
            <input
              id="vehicle-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              required
              maxLength={80}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="vehicle-category">
              Category
            </label>
            <input
              id="vehicle-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
              maxLength={80}
              placeholder="SUV, Sedan, Electric…"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="vehicle-price">
              Price (major units)
            </label>
            <input
              id="vehicle-price"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="e.g. 1895000.00"
              required
              maxLength={30}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="vehicle-currency">
              Currency
            </label>
            <select
              id="vehicle-currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {currencyCodes.map((code) => (
                <option key={code} value={code}>
                  {currencyLabel(code)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="vehicle-quantity">
              {editing ? 'Quantity in stock' : 'Starting stock'}
            </label>
            <input
              id="vehicle-quantity"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
            />
          </div>
        </div>
        <p className="form-helper">
          Prices are stored as exact minor units. The currency stays attached to this vehicle.
        </p>
        {(formError || serverError) && (
          <p className="form-alert" role="alert">
            {formError || serverError}
          </p>
        )}
        <div className="form-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save vehicle'} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </form>
    </section>
  );
}
