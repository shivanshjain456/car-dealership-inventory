import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FilterPanel, { EMPTY_FILTERS, type VehicleFilters } from './FilterPanel.js';

function renderFilterPanel(busy = false) {
  const onApply = vi.fn<(filters: VehicleFilters) => void>();
  const onReset = vi.fn<() => void>();

  function Harness() {
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    return (
      <FilterPanel
        filters={filters}
        setFilters={setFilters}
        onApply={onApply}
        onReset={onReset}
        busy={busy}
      />
    );
  }

  return { ...render(<Harness />), onApply, onReset };
}

describe('FilterPanel', () => {
  it('exposes an operable expanded state for the mobile filter toggle', async () => {
    const user = userEvent.setup();
    renderFilterPanel();

    const toggle = screen.getByRole('button', { name: 'Filters' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('submits the current filter state and closes the mobile panel', async () => {
    const user = userEvent.setup();
    const { onApply } = renderFilterPanel();

    await user.type(screen.getByLabelText('Search the collection'), 'EV6');
    await user.type(screen.getByLabelText('Make'), 'Kia');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(onApply).toHaveBeenCalledWith({ ...EMPTY_FILTERS, q: 'EV6', make: 'Kia' });
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('delegates reset and disables search/reset actions while a request is pending', async () => {
    const user = userEvent.setup();
    const { onReset } = renderFilterPanel(true);

    expect(screen.getByRole('button', { name: 'Searching…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(onReset).not.toHaveBeenCalled();
  });

  it('delegates reset when the panel is idle', async () => {
    const user = userEvent.setup();
    const { onReset } = renderFilterPanel();

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
