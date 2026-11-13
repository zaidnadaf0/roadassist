import { Link } from 'react-router-dom';
import { Button, Card, PageHeader } from '@/components/ui';

/** Emergency guidance + universal helpline. Static safety content — no backend. */
export function EmergencyPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Emergency" description="If anyone is hurt, call emergency services first — then request help." />
      <div className="grid gap-4">
        <Card className="border-danger/30 bg-danger/5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-danger">India universal emergency</p>
          <a href="tel:112" className="mt-1 block text-4xl font-extrabold tracking-tight text-cream">112</a>
          <p className="mt-1 text-sm text-steel-300">Police · Fire · Ambulance. Free from any phone.</p>
          <div className="mt-3">
            <a href="tel:112">
              <Button variant="danger">Call 112 now</Button>
            </a>
          </div>
        </Card>
        <Card>
          <p className="font-semibold text-cream">While you wait for your mechanic</p>
          <ol className="mt-2 grid list-decimal gap-1.5 pl-5 text-sm text-steel-300">
            <li>Move everyone away from traffic; switch on hazard lights.</li>
            <li>Place the warning triangle 50+ metres behind the vehicle.</li>
            <li>Stay visible — wear bright clothing at night.</li>
            <li>Note your location (road name, direction, landmark) for the request form.</li>
            <li>Do not accept help that asks for advance cash payment.</li>
          </ol>
          <p className="mt-3">
            <Link to="/request" className="text-sm font-medium text-safety-400 hover:text-safety-300">Place a RoadAssist request →</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
