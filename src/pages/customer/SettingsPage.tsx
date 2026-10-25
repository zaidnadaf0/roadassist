import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { firebaseProjectId } from '@/lib/firebase';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { DEMO_CUSTOMER_PROFILE, resetDemoState } from '@/lib/fixtures';

export function SettingsPage() {
  const { configured, demoMode, setDemoMode, signOut, user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Backend connection and account controls." />
      <div className="grid gap-4">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-cream">Presentation environment</p>
              <p className="mt-1 max-w-xl text-sm leading-6 text-steel-300">Use fictional, connected sample records for your project demonstration. Demo actions stay in this browser and never write to Firebase.</p>
            </div>
            <Badge tone={demoMode ? 'brand' : 'neutral'}>{demoMode ? 'demo mode' : 'live mode'}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant={demoMode ? 'primary' : 'secondary'} onClick={() => setDemoMode(true)}>Use demo data</Button>
            <Button size="sm" variant={!demoMode ? 'primary' : 'secondary'} onClick={() => setDemoMode(false)}>Use live Firebase</Button>
            <Button size="sm" variant="secondary" onClick={() => { setDemoMode(true); resetDemoState(); navigate('/track/demo-request-pending'); }}>Start demo presentation</Button>
          </div>
          <p className="mt-2 text-xs text-steel-400">Demo mode is selected for local development by default. Switching to live mode stops all fictional fallbacks.</p>
        </Card>
        <Card>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Backend</p>
          <dl className="mt-2 grid gap-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-steel-400">Status</dt><dd className="font-medium text-cream">{configured ? 'Connected' : 'Not connected'}</dd></div>
            {configured && firebaseProjectId && (
              <div className="flex justify-between"><dt className="text-steel-400">Project</dt><dd className="font-mono text-xs text-cream">{firebaseProjectId}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-steel-400">Signed in as</dt><dd className="font-medium text-cream">{demoMode ? DEMO_CUSTOMER_PROFILE.email : user?.email ?? '—'}</dd></div>
          </dl>
        </Card>
        <Card>
          <p className="font-semibold text-cream">Sign out</p>
          <p className="mt-1 text-sm text-steel-300">Ends this session on this device.</p>
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => {
                void signOut().then(() => {
                  window.location.href = '/login';
                });
              }}
            >
              Sign out
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
