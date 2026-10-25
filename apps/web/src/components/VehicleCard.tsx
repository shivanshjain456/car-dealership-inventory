import { useState, type FormEvent } from 'react';
import type { VehicleDto } from '@motorline/contracts';
import { formatMoney } from '../formatMoney.js';
import VehicleIllustration from './VehicleIllustration.js';

interface VehicleCardProps {
  vehicle: VehicleDto;
  isAdmin: boolean;
  actionBusy: boolean;
  purchaseBusy: boolean;
  restockBusy: boolean;
  onPurchase(vehicle: VehicleDto): void;
  onEdit(vehicle: VehicleDto): void;
  onDelete(vehicle: VehicleDto): void;
  onRestock(vehicle: VehicleDto, quantity: number): Promise<boolean>;
}

export default function VehicleCard({
  vehicle,
  isAdmin,
  actionBusy,
  purchaseBusy,
  restockBusy,
  onPurchase,
  onEdit,
  onDelete,
  onRestock
}: VehicleCardProps) {
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockQuantity, setRestockQuantity] = useState('1');
  const titleId = `vehicle-title-${vehicle.id}`;

  async function submitRestock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionBusy) return;
    const quantity = Number(restockQuantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return;
    const succeeded = await onRestock(vehicle, quantity);
    if (!succeeded) return;
    setRestockOpen(false);
    setRestockQuantity('1');
  }

  return (
    <article className="vehicle-card" aria-labelledby={titleId}>
      <div className="vehicle-art-wrap">
        <span className="art-number" aria-hidden="true">
          ML / {vehicle.id.slice(0, 2).toUpperCase()}
        </span>
        <VehicleIllustration vehicle={vehicle} />
        <span
          className={`availability ${vehicle.quantity > 0 ? 'is-available' : 'is-unavailable'}`}
        >
          <span className="availability-dot" aria-hidden="true" />
          {vehicle.quantity > 0 ? 'Available' : 'Out of stock'}
        </span>
      </div>

      <div className="vehicle-card-body">
        <div className="vehicle-card-topline">
          <p className="vehicle-make">{vehicle.make}</p>
          <span className="vehicle-category">{vehicle.category}</span>
        </div>
        <h2 id={titleId} className="vehicle-title">
          {vehicle.model}
        </h2>
        <div className="vehicle-price-row">
          <p className="vehicle-price">{formatMoney(vehicle.price)}</p>
          <p className="vehicle-stock" aria-label={`Stock: ${vehicle.quantity}`}>
            {vehicle.quantity > 0 ? `${vehicle.quantity} in stock` : 'No units'}
          </p>
        </div>

        <div className="vehicle-card-actions">
          <button
            className="button button-primary purchase-button"
            type="button"
            aria-label={`Purchase ${vehicle.make} ${vehicle.model}`}
            disabled={vehicle.quantity === 0 || actionBusy}
            onClick={() => onPurchase(vehicle)}
          >
            {purchaseBusy ? 'Processing…' : restockBusy ? 'Stock updating…' : 'Purchase'}
            {vehicle.quantity > 0 && <span aria-hidden="true">↗</span>}
          </button>
        </div>

        {isAdmin && (
          <div
            className="admin-card-actions"
            role="group"
            aria-label={`Admin actions for ${vehicle.model}`}
          >
            <button className="quiet-button" type="button" onClick={() => onEdit(vehicle)}>
              Edit details
            </button>
            <button
              className="quiet-button"
              type="button"
              disabled={actionBusy}
              onClick={() => setRestockOpen((open) => !open)}
            >
              {restockOpen ? 'Close restock' : 'Restock'}
            </button>
            <button
              className="quiet-button danger-button"
              type="button"
              onClick={() => onDelete(vehicle)}
            >
              Delete
            </button>
          </div>
        )}

        {isAdmin && restockOpen && (
          <form className="restock-form" onSubmit={submitRestock}>
            <label htmlFor={`restock-${vehicle.id}`}>Quantity to add for {vehicle.model}</label>
            <div className="restock-form-row">
              <input
                id={`restock-${vehicle.id}`}
                type="number"
                min="1"
                step="1"
                disabled={actionBusy}
                value={restockQuantity}
                onChange={(event) => setRestockQuantity(event.target.value)}
              />
              <button className="button button-secondary" type="submit" disabled={actionBusy}>
                {restockBusy ? 'Adding…' : actionBusy ? 'Wait…' : 'Add stock'}
              </button>
            </div>
          </form>
        )}
      </div>
    </article>
  );
}
