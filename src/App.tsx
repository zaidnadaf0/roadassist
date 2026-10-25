import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './app/AuthProvider';
import { Routes } from './routes';

/** Application root: routing plus the Firebase authentication context. */
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </BrowserRouter>
  );
}
