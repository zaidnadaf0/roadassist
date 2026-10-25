import { Card, EmptyState, PageHeader, PreviewNotice } from '@/components/ui';

export interface PageProps {
  title: string;
  description?: string;
  routePath: string;
}

/**
 * M1 placeholder for every not-yet-built screen.
 * Renders the same header + honest backend notice everywhere so no route
 * can ever look "done" while it is still a shell.
 */
export function PlaceholderPage({ title, description, routePath }: PageProps) {
  return (
    <div className="mx-auto max-w-4xl">
      <PreviewNotice routePath={routePath} />
      <PageHeader title={title} description={description} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Coming in a later phase</p>
          <p className="mt-2 font-semibold text-cream">Real content, not fixtures</p>
          <p className="mt-1 text-sm text-steel-300">
            Lists, details, and actions on this screen will be backed by Firebase once the backend
            phases land. Nothing here writes or stores production data.
          </p>
        </Card>
        <EmptyState
          title="Nothing to show yet"
          description="This is the reserved home for this screen's real workflow. The layout, navigation, and states around it are already final-shaped."
        />
      </div>
    </div>
  );
}
