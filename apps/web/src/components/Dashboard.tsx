import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserDto, VehicleDto, VehicleInput, VehiclePage } from '@motorline/contracts';
import { api, ApiClientError } from '../api.js';
import type { VehicleFilters } from './FilterPanel.js';
import FilterPanel, { EMPTY_FILTERS } from './FilterPanel.js';
import InventoryForm from './InventoryForm.js';
import VehicleCard from './VehicleCard.js';
import Brand from './Brand.js';

interface DashboardProps {
  user: UserDto;
  onSessionEnded(): void;
}

type InventoryLoadResult =
  { status: 'loaded' } | { status: 'failed'; message: string } | { status: 'unauthorized' };
type VehicleAction = 'purchase' | 'restock';

function messageFor(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : 'The inventory could not be reached. Check the connection and try again.';
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

function isStaleWrite(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'STALE_WRITE';
}

function buildQuery(filters: VehicleFilters): URLSearchParams | undefined {
  const query = new URLSearchParams();
  const fields: Array<keyof Pick<VehicleFilters, 'q' | 'make' | 'model' | 'category'>> = [
    'q',
    'make',
    'model',
    'category'
  ];
  for (const field of fields) {
    const value = filters[field].trim();
    if (value) query.set(field, value);
  }

  const minPrice = filters.minPrice.trim();
  const maxPrice = filters.maxPrice.trim();
  if (minPrice) query.set('minPrice', minPrice);
  if (maxPrice) query.set('maxPrice', maxPrice);
  if (filters.currency && (minPrice || maxPrice)) query.set('currency', filters.currency);
  else if (filters.currency && !minPrice && !maxPrice) query.set('currency', filters.currency);

  return query.toString() ? query : undefined;
}

function hasActiveVehicleFilters(query: URLSearchParams | undefined): boolean {
  return ['q', 'make', 'model', 'category', 'minPrice', 'maxPrice', 'currency'].some((field) =>
    query?.has(field)
  );
}

function dialogFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true'
  );
}

export default function Dashboard({ user, onSessionEnded }: DashboardProps) {
  const [vehicles, setVehicles] = useState<VehiclePage | null>(null);
  const [filters, setFilters] = useState<VehicleFilters>(EMPTY_FILTERS);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState('');
  const [formError, setFormError] = useState('');
  const [status, setStatus] = useState('');
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<VehicleDto | undefined>();
  const [formBusy, setFormBusy] = useState(false);
  const [busyVehicleActions, setBusyVehicleActions] = useState<Map<string, VehicleAction>>(
    () => new Map()
  );
  const [pendingDelete, setPendingDelete] = useState<VehicleDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const currentQuery = useRef<URLSearchParams | undefined>(undefined);
  const busyVehicleActionsRef = useRef(new Map<string, VehicleAction>());
  const deleteDialogRef = useRef<HTMLElement | null>(null);
  const deleteBusyRef = useRef(false);
  const focusCollectionAfterDeleteRef = useRef(false);
  const isAdmin = user.role === 'admin';

  function beginVehicleAction(id: string, action: VehicleAction): boolean {
    if (busyVehicleActionsRef.current.has(id)) return false;
    const next = new Map(busyVehicleActionsRef.current);
    next.set(id, action);
    busyVehicleActionsRef.current = next;
    setBusyVehicleActions(next);
    return true;
  }

  function endVehicleAction(id: string): void {
    const next = new Map(busyVehicleActionsRef.current);
    next.delete(id);
    busyVehicleActionsRef.current = next;
    setBusyVehicleActions(next);
  }

  const loadVehicles = useCallback(
    async (query = currentQuery.current): Promise<InventoryLoadResult> => {
      setLoading(true);
      setGlobalError('');
      try {
        const result = await api.listVehicles(query);
        setVehicles(result);
        return { status: 'loaded' };
      } catch (error) {
        if (isUnauthorized(error)) {
          onSessionEnded();
          return { status: 'unauthorized' };
        }
        const message = messageFor(error);
        setGlobalError(message);
        return { status: 'failed', message };
      } finally {
        setLoading(false);
      }
    },
    [onSessionEnded]
  );

  useEffect(() => {
    let active = true;
    currentQuery.current = undefined;

    api
      .listVehicles()
      .then((result) => {
        if (active) setVehicles(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (isUnauthorized(error)) onSessionEnded();
        else setGlobalError(messageFor(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [onSessionEnded]);

  useEffect(() => {
    if (!pendingDelete) return;
    const dialog = deleteDialogRef.current;
    if (!dialog) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = dialogFocusableElements(dialog);
    (focusable[0] ?? dialog).focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!deleteBusyRef.current) setPendingDelete(null);
        return;
      }
      if (event.key !== 'Tab') return;

      const activeDialog = deleteDialogRef.current;
      if (!activeDialog) return;
      const elements = dialogFocusableElements(activeDialog);
      const first = elements[0];
      const last = elements.at(-1);
      const activeElement = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        activeDialog.focus();
      } else if (
        event.shiftKey &&
        (activeElement === first || !activeDialog.contains(activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === last || !activeDialog.contains(activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDialogKeyDown);
      if (focusCollectionAfterDeleteRef.current || !previouslyFocused?.isConnected) {
        focusCollectionAfterDeleteRef.current = false;
        document.getElementById('collection-title')?.focus();
      } else {
        previouslyFocused.focus();
      }
    };
  }, [pendingDelete]);

  function applyFilters(nextFilters: VehicleFilters) {
    const hasPriceBound = Boolean(nextFilters.minPrice.trim() || nextFilters.maxPrice.trim());
    if (hasPriceBound && !nextFilters.currency) {
      setGlobalError('Choose a currency before applying a price range.');
      return;
    }
    currentQuery.current = buildQuery(nextFilters);
    setHasActiveFilters(hasActiveVehicleFilters(currentQuery.current));
    setStatus('');
    void loadVehicles(currentQuery.current);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    currentQuery.current = undefined;
    setHasActiveFilters(false);
    setStatus('');
    void loadVehicles(undefined);
  }

  function openCreateForm() {
    setFormMode('create');
    setEditingVehicle(undefined);
    setFormError('');
    setGlobalError('');
  }

  function replaceVehicle(updated: VehicleDto) {
    setVehicles((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item.id === updated.id ? updated : item))
          }
        : current
    );
  }

  async function purchaseVehicle(vehicle: VehicleDto) {
    if (!beginVehicleAction(vehicle.id, 'purchase')) return;
    setGlobalError('');
    setStatus('');
    try {
      const updated = await api.purchaseOne(vehicle.id);
      replaceVehicle(updated);
      setStatus(
        `Stock updated: one ${updated.make} ${updated.model} unit was deducted. No payment was processed.`
      );
    } catch (error) {
      if (isUnauthorized(error)) onSessionEnded();
      else if (error instanceof ApiClientError && error.code === 'OUT_OF_STOCK') {
        const refresh = await loadVehicles(currentQuery.current);
        if (refresh.status === 'unauthorized') return;
        setGlobalError(
          refresh.status === 'loaded'
            ? 'This vehicle has just sold out. Inventory has been refreshed.'
            : `This vehicle has just sold out, but inventory could not be refreshed. ${refresh.message}`
        );
      } else setGlobalError(messageFor(error));
    } finally {
      endVehicleAction(vehicle.id);
    }
  }

  async function restockVehicle(vehicle: VehicleDto, quantity: number): Promise<boolean> {
    if (!beginVehicleAction(vehicle.id, 'restock')) return false;
    setGlobalError('');
    setStatus('');
    try {
      const updated = await api.restock(vehicle.id, quantity);
      replaceVehicle(updated);
      setStatus(`${updated.make} ${updated.model} stock updated to ${updated.quantity}.`);
      return true;
    } catch (error) {
      if (isUnauthorized(error)) onSessionEnded();
      else setGlobalError(messageFor(error));
      return false;
    } finally {
      endVehicleAction(vehicle.id);
    }
  }

  async function saveVehicle(input: VehicleInput) {
    setFormBusy(true);
    setFormError('');
    setGlobalError('');
    try {
      if (formMode === 'edit' && editingVehicle) {
        await api.updateVehicle(editingVehicle.id, input, editingVehicle.version);
        setStatus(`${input.make} ${input.model} details updated.`);
      } else {
        await api.createVehicle(input);
        setStatus(`${input.make} ${input.model} added to the collection.`);
      }
      setFormMode(null);
      setEditingVehicle(undefined);
      await loadVehicles(currentQuery.current);
    } catch (error) {
      if (isUnauthorized(error)) onSessionEnded();
      else if (isStaleWrite(error)) {
        const refresh = await loadVehicles(currentQuery.current);
        if (refresh.status === 'unauthorized') return;
        setFormError(
          refresh.status === 'loaded'
            ? 'This vehicle changed in another session. Inventory has been refreshed; cancel and reopen the form to review the latest details before saving.'
            : `This vehicle changed in another session, but the latest inventory could not be refreshed. ${refresh.message} Your unsaved changes remain in the form; reload before saving.`
        );
      } else setFormError(messageFor(error));
    } finally {
      setFormBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleteBusyRef.current) return;
    deleteBusyRef.current = true;
    setDeleteBusy(true);
    setGlobalError('');
    try {
      const deleted = pendingDelete;
      await api.deleteVehicle(deleted.id, deleted.version);
      focusCollectionAfterDeleteRef.current = true;
      setPendingDelete(null);
      setStatus(`${deleted.make} ${deleted.model} removed from inventory.`);
      await loadVehicles(currentQuery.current);
    } catch (error) {
      if (isUnauthorized(error)) onSessionEnded();
      else if (isStaleWrite(error)) {
        setPendingDelete(null);
        const refresh = await loadVehicles(currentQuery.current);
        if (refresh.status === 'unauthorized') return;
        setGlobalError(
          refresh.status === 'loaded'
            ? 'This vehicle changed in another session. Inventory has been refreshed; review its latest details before trying again.'
            : `This vehicle changed in another session, but the latest inventory could not be refreshed. ${refresh.message}`
        );
      } else setGlobalError(messageFor(error));
    } finally {
      deleteBusyRef.current = false;
      setDeleteBusy(false);
    }
  }

  async function signOut() {
    setGlobalError('');
    setStatus('');
    try {
      await api.logout();
      onSessionEnded();
    } catch (error) {
      if (isUnauthorized(error)) {
        onSessionEnded();
        return;
      }
      setGlobalError(
        'We could not confirm sign out. You may still be signed in; check your connection and try again.'
      );
    }
  }

  function changePage(pageNumber: number) {
    const query = new URLSearchParams(currentQuery.current?.toString() ?? '');
    query.set('page', String(pageNumber));
    query.set('limit', String(vehicles?.limit ?? 20));
    currentQuery.current = query;
    void loadVehicles(query);
  }

  const displayedCount = vehicles?.total ?? 0;

  return (
    <div className="app-shell min-h-screen">
      <header className="app-topbar">
        <Brand />
        <nav className="topbar-nav" aria-label="Primary navigation">
          <span className="nav-current">
            <span className="nav-current-dot" /> VEHICLE INVENTORY
          </span>
          <span className="nav-divider" aria-hidden="true" />
          <span className={`role-chip${isAdmin ? ' role-admin' : ''}`}>
            {isAdmin ? 'ADMIN' : 'CUSTOMER'}
          </span>
          <span className="signed-in-email">{user.email}</span>
          <button className="quiet-button signout-button" type="button" onClick={signOut}>
            Sign out
          </button>
        </nav>
      </header>

      <main className="inventory-main">
        <section className="collection-heading" aria-labelledby="collection-title">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" /> INVENTORY / ALL VEHICLES
            </p>
            <h1 id="collection-title" tabIndex={-1}>
              The collection<span className="heading-period">.</span>
            </h1>
            <p className="collection-subtitle">A clear view of vehicle availability and stock.</p>
            <p className="purchase-disclosure">
              Purchases update inventory only; no payment is processed.
            </p>
          </div>
          <div className="collection-heading-side">
            <span className="sample-label">
              <span aria-hidden="true">✳</span> LOCAL INVENTORY
            </span>
            {isAdmin && (
              <button
                className="button button-primary add-vehicle-button"
                type="button"
                onClick={openCreateForm}
              >
                <span aria-hidden="true">＋</span> Add vehicle
              </button>
            )}
          </div>
        </section>

        {status && (
          <p className="live-message" role="status" aria-live="polite">
            {status}
          </p>
        )}
        {globalError && (
          <p className="global-alert" role="alert">
            {globalError}
          </p>
        )}

        {formMode && isAdmin && (
          <InventoryForm
            key={formMode === 'edit' ? (editingVehicle?.id ?? 'edit') : 'new'}
            {...(formMode === 'edit' && editingVehicle ? { vehicle: editingVehicle } : {})}
            busy={formBusy}
            serverError={formError}
            onSave={saveVehicle}
            onCancel={() => {
              setFormMode(null);
              setEditingVehicle(undefined);
              setFormError('');
            }}
          />
        )}

        <div className="inventory-workspace">
          <FilterPanel
            filters={filters}
            setFilters={setFilters}
            onApply={applyFilters}
            onReset={resetFilters}
            busy={loading}
          />

          <section className="results-section" aria-label="Vehicle results" aria-busy={loading}>
            <div className="results-toolbar">
              <div>
                <p className="results-overline">CURATED FOR THE ROAD AHEAD</p>
                <h2>
                  {loading && !vehicles
                    ? 'Loading the collection'
                    : `${displayedCount} ${displayedCount === 1 ? 'vehicle' : 'vehicles'}`}
                </h2>
              </div>
              <div className="results-sort">
                <span className="sort-label">ORDER</span>
                <span>
                  Make <span aria-hidden="true">↑</span>
                </span>
              </div>
            </div>

            {loading && !vehicles && (
              <p className="loading-state" role="status">
                Loading inventory…
              </p>
            )}
            {!loading && vehicles && vehicles.items.length === 0 && vehicles.total === 0 && (
              <div className="empty-state">
                <span className="empty-state-mark" aria-hidden="true">
                  ∅
                </span>
                {hasActiveFilters ? (
                  <>
                    <p className="eyebrow">NO MATCHES, YET</p>
                    <h3>No vehicles match your filters.</h3>
                    <p>Try another make, model, category, or currency range.</p>
                    <button className="quiet-button" type="button" onClick={resetFilters}>
                      Clear all filters
                    </button>
                  </>
                ) : isAdmin ? (
                  <>
                    <p className="eyebrow">INVENTORY / EMPTY</p>
                    <h3>No vehicles have been added yet.</h3>
                    <p>Add the first vehicle to make inventory available to customers.</p>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={openCreateForm}
                    >
                      Add your first vehicle
                    </button>
                  </>
                ) : (
                  <>
                    <p className="eyebrow">CATALOG / EMPTY</p>
                    <h3>No vehicles are available right now.</h3>
                    <p>Check back after the dealership adds inventory.</p>
                  </>
                )}
              </div>
            )}
            {!loading && vehicles && vehicles.items.length === 0 && vehicles.total > 0 && (
              <div className="empty-state">
                <span className="empty-state-mark" aria-hidden="true">
                  ∅
                </span>
                <p className="eyebrow">PAGE {vehicles.page}</p>
                <h3>No vehicles on this page.</h3>
                <p>Matching vehicles exist on other pages.</p>
                {vehicles.page > 1 && (
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={() => changePage(vehicles.page - 1)}
                  >
                    Go to previous page
                  </button>
                )}
              </div>
            )}

            {vehicles && vehicles.items.length > 0 && (
              <div className="vehicle-grid">
                {vehicles.items.map((vehicle) => (
                  <VehicleCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    isAdmin={isAdmin}
                    actionBusy={busyVehicleActions.has(vehicle.id)}
                    purchaseBusy={busyVehicleActions.get(vehicle.id) === 'purchase'}
                    restockBusy={busyVehicleActions.get(vehicle.id) === 'restock'}
                    onPurchase={purchaseVehicle}
                    onEdit={(selected) => {
                      setEditingVehicle(selected);
                      setFormMode('edit');
                      setFormError('');
                      setGlobalError('');
                    }}
                    onDelete={setPendingDelete}
                    onRestock={restockVehicle}
                  />
                ))}
              </div>
            )}

            {vehicles && vehicles.totalPages > 1 && (
              <nav className="pagination" aria-label="Vehicle pages">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => changePage(vehicles.page - 1)}
                  disabled={vehicles.page <= 1 || loading}
                >
                  ← Previous
                </button>
                <span>
                  Page <strong>{vehicles.page}</strong> of {vehicles.totalPages}
                </span>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => changePage(vehicles.page + 1)}
                  disabled={vehicles.page >= vehicles.totalPages || loading}
                >
                  Next →
                </button>
              </nav>
            )}
          </section>
        </div>
      </main>

      <footer className="app-footer">
        <span>MOTORLINE / INVENTORY</span>
        <span>Inventory management · No payment processing</span>
        <span>© 2026 · Local operations</span>
      </footer>

      {pendingDelete && (
        <div className="dialog-backdrop">
          <section
            ref={deleteDialogRef}
            className="confirm-dialog"
            role="alertdialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="delete-title"
            aria-describedby="delete-description"
          >
            <p className="eyebrow">
              <span className="eyebrow-rule" /> ADMIN / REMOVE
            </p>
            <h2 id="delete-title">Delete this vehicle?</h2>
            <p id="delete-description">
              {pendingDelete.make} {pendingDelete.model} will be permanently removed from the
              inventory. This action cannot be undone.
            </p>
            <div className="form-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleteBusy}
              >
                Keep vehicle
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={confirmDelete}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'Deleting…' : 'Confirm delete'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
