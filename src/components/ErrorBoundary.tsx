import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Root render-crash guard. One malformed document (for example a request
 * missing a numeric field) must never white-screen the whole SPA — anything
 * thrown below this boundary renders this fallback instead. Reload restores
 * a clean session; the error is logged for diagnosis.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] render crash:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-cream">Something went wrong</h1>
        <p className="mt-3 text-sm text-steel-300">
          The page hit an unexpected error while rendering. Your data is safe on the server — reloading usually fixes this.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 items-center rounded-xl bg-safety-500 px-5 text-sm font-semibold text-graphite hover:bg-safety-400"
          >
            Reload the page
          </button>
          <a
            href="/"
            className="inline-flex h-11 items-center rounded-xl border border-line-soft px-5 text-sm font-medium text-cream hover:border-line-strong"
          >
            Go to the home page
          </a>
        </div>
        {import.meta.env.DEV && (
          <pre className="mt-6 max-h-64 overflow-auto rounded-xl bg-graphite-soft p-4 text-left text-xs text-danger">
            {String(error.stack ?? error.message)}
          </pre>
        )}
      </div>
    );
  }
}
