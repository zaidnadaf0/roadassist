import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { Card, PageHeader } from '@/components/ui';
import { FIXTURE_SERVICES } from '@/lib/fixtures';

/** Service catalogue (fixture display copy; bookings write real requests). */
export function ServicesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Request help" description="Choose what stopped you. Catalogue prices are illustrative; any final amount comes from the completed service record." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIXTURE_SERVICES.map((s) => (
          <Card key={s.id}>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-safety-500/10 text-safety-400">
              <Icon name="wrench" size={20} />
            </span>
            <h2 className="mt-3 font-bold text-cream">{s.name}</h2>
            <p className="mt-1 text-sm text-steel-300">{s.desc}</p>
            <p className="mt-3 font-mono text-xs text-steel-400">from ₹{s.base} · {s.eta}</p>
            <Link
              to={`/request?service=${s.id}`}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-safety-500 px-5 text-sm font-semibold text-white hover:bg-safety-600"
            >
              Book {s.name}
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
