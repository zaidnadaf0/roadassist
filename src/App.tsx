import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './app/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Routes } from './routes';

/** Application root: render-crash guard, routing, and the Firebase auth context. */
export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
