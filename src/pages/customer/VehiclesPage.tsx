import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Button, Card, DemoNotice, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader } from '@/components/ui';
import { addVehicle, deleteVehicle, listVehicles, nextDefaultAfterDelete, setDefaultVehicle, type Vehicle } from '@/lib/customer';
import { DEMO_CUSTOMER_VEHICLES } from '@/lib/fixtures';

const TYPES: Vehicle['type'][] = ['car', 'bike', 'van', 'truck'];

export function VehiclesPage() {
  const { demoMode, user } = useAuth();
  const uid = user?.uid ?? '';
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [form, setForm] = useState({ make: '', model: '', year: new Date().getFullYear(), plate: '', type: 'car' as Vehicle['type'] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!uid) return;
    if (demoMode) {
      setVehicles(DEMO_CUSTOMER_VEHICLES.filter((item) => item.ownerId === 'demo-customer'));
      setLoadError(false);
      return;
    }
    setLoadError(false);
    try {
      setVehicles(await listVehicles(uid));
    } catch {
      // Keep the previous list (if any) but surface the failure distinctly —
      // a rules/network error must not read as "No vehicles yet".
      setVehicles((prev) => prev ?? []);
      setLoadError(true);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, demoMode, retry]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!uid || busy || demoMode) return;
    if (!form.make.trim() || !form.model.trim() || !form.plate.trim() || !Number.isFinite(form.year)) {
      setError('Fill make, model, year, and plate.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addVehicle(uid, { make: form.make, model: form.model, year: Math.round(form.year), plate: form.plate, type: form.type });
      setForm({ make: '', model: '', year: new Date().getFullYear(), plate: '', type: 'car' });
      await reload();
    } catch {
      setError('Could not save the vehicle. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (demoMode || !window.confirm('Remove this vehicle?')) return;
    // Default continuity: if the deleted vehicle held the default flag,
    // promote the first remaining one so the fleet keeps exactly one
    // default (the atomic batch in setDefaultVehicle does the swap).
    const target = (vehicles ?? []).find((v) => v.id === id) ?? null;
    try {
      await deleteVehicle(id);
    } catch {
      setError('Could not remove the vehicle.');
      return;
    }
    const next = nextDefaultAfterDelete(target, (vehicles ?? []).filter((v) => v.id !== id));
    if (next) await setDefaultVehicle(next, null);
    setError(null);
    await reload();
  }

  async function onDefault(id: string) {
    if (demoMode) return;
    // One atomic batch unsets the old default and sets the new one — a
    // half-applied default (zero or two defaults) is impossible.
    const previous = (vehicles ?? []).find((v) => v.isDefault && v.id !== id);
    const ok = await setDefaultVehicle(id, previous?.id ?? null);
    if (!ok) {
      setError('Could not update the default vehicle. Try again.');
      return;
    }
    setError(null);
    await reload();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My vehicles" description="Mechanics come to these vehicles. Keep plates and details current." />
      {demoMode && <DemoNotice>These fictional vehicles are linked to the demo customer and are read-only sample records.</DemoNotice>}
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-cream">{error}</p>
      )}
      {vehicles === null && !loadError ? (
        <LoadingState label="Loading vehicles…" />
      ) : loadError ? (
        <ErrorState
          title="Vehicles unavailable"
          description="Your saved vehicles could not be loaded. Nothing was changed — check your connection and retry."
          action={<Button size="sm" variant="secondary" onClick={() => setRetry((n) => n + 1)}>Retry</Button>}
        />
      ) : (vehicles ?? []).length === 0 ? (
        <EmptyState title="No vehicles yet" description="Add your first vehicle below to start requesting help." />
      ) : (
        <ul className="grid gap-2">
          {(vehicles ?? []).map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-line-soft px-4 py-3">
              <div>
                <p className="font-medium text-cream">{v.make} {v.model} · {v.plate}</p>
                <p className="font-mono text-xs text-steel-400">{v.type} · {v.year}</p>
              </div>
              <div className="flex items-center gap-2">
                {v.isDefault ? (
                  <Badge tone="brand">default</Badge>
                ) : (
                  <Button size="sm" variant="ghost" disabled={demoMode} onClick={() => onDefault(v.id)}>Set default</Button>
                )}
                <Button size="sm" variant="ghost" disabled={demoMode} onClick={() => onDelete(v.id)}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <p className="font-semibold text-cream">Add a vehicle</p>
        <form onSubmit={onAdd} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Make"><Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="Maruti" required /></Field>
          <Field label="Model"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Swift" required /></Field>
          <Field label="Year"><Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} min={1980} max={2035} required /></Field>
          <Field label="Plate"><Input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="KA01AB1234" required /></Field>
          <Field label="Type">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Vehicle['type'] })} className="h-11 w-full rounded-xl border border-line-soft bg-grease-soft px-3.5 text-cream">
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end"><Button type="submit" disabled={busy || demoMode}>{demoMode ? 'Demo records are fixed' : busy ? 'Saving…' : 'Add vehicle'}</Button></div>
        </form>
      </Card>
    </div>
  );
}
