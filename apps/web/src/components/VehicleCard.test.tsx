import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { VehicleDto } from '@motorline/contracts';
import VehicleCard from './VehicleCard.js';

const vehicle: VehicleDto = {
  id: '33333333-3333-4333-8333-333333333333',
  make: 'Kia',
  model: 'EV6 GT-Line',
  category: 'Electric',
  price: { amount: '54990.00', currency: 'USD' },
  quantity: 2,
  version: 1,
  createdAt: '2026-10-23T00:00:00.000Z',
  updatedAt: '2026-10-23T00:00:00.000Z'
};

function renderCard(overrides: Partial<Parameters<typeof VehicleCard>[0]> = {}) {
  const props: Parameters<typeof VehicleCard>[0] = {
    vehicle,
    isAdmin: false,
    actionBusy: false,
    purchaseBusy: false,
    restockBusy: false,
    onPurchase: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onRestock: vi.fn().mockResolvedValue(true),
    ...overrides
  };
  return { ...render(<VehicleCard {...props} />), props };
}

describe('VehicleCard', () => {
  it('keeps zero-stock purchase disabled and hides Admin controls from Customers', () => {
    renderCard({ vehicle: { ...vehicle, quantity: 0 } });

    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purchase Kia EV6 GT-Line' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Restock' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('routes Admin edit and delete actions to their callbacks', async () => {
    const user = userEvent.setup();
    const { props } = renderCard({ isAdmin: true });

    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(props.onEdit).toHaveBeenCalledWith(vehicle);
    expect(props.onDelete).toHaveBeenCalledWith(vehicle);
    expect(
      screen.getByRole('group', { name: 'Admin actions for EV6 GT-Line' })
    ).toBeInTheDocument();
  });

  it('closes the restock form after success and leaves it open for a retry after failure', async () => {
    const user = userEvent.setup();
    const onRestock = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    renderCard({ isAdmin: true, onRestock });

    await user.click(screen.getByRole('button', { name: 'Restock' }));
    let quantityInput = screen.getByLabelText('Quantity to add for EV6 GT-Line');
    await user.clear(quantityInput);
    await user.type(quantityInput, '3');
    await user.click(screen.getByRole('button', { name: 'Add stock' }));
    expect(onRestock).toHaveBeenNthCalledWith(1, vehicle, 3);
    expect(screen.queryByLabelText('Quantity to add for EV6 GT-Line')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restock' }));
    quantityInput = screen.getByLabelText('Quantity to add for EV6 GT-Line');
    await user.clear(quantityInput);
    await user.type(quantityInput, '4');
    await user.click(screen.getByRole('button', { name: 'Add stock' }));
    expect(onRestock).toHaveBeenNthCalledWith(2, vehicle, 4);
    expect(screen.getByLabelText('Quantity to add for EV6 GT-Line')).toBeInTheDocument();
  });

  it('shows a busy purchase state and disables a duplicate request', () => {
    renderCard({ actionBusy: true, purchaseBusy: true });

    expect(screen.getByRole('button', { name: 'Purchase Kia EV6 GT-Line' })).toBeDisabled();
    expect(screen.getByText('Processing…')).toBeInTheDocument();
  });
});
