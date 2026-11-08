import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/authContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { QueuePage } from './pages/QueuePage';
import { TicketPage } from './pages/TicketPage';
import { EvalsPage } from './pages/EvalsPage';
import { SubmitPage } from './pages/SubmitPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Restoring your session…" />
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

/** /submit is public, but signed-in agents see it inside the console layout. */
function SubmitRoute() {
  const { user } = useAuth();
  return user ? <Layout /> : <SubmitPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/submit" element={<SubmitRoute />}>
        <Route index element={<SubmitPage />} />
      </Route>
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<QueuePage />} />
        <Route path="tickets/:id" element={<TicketPage />} />
        <Route path="evals" element={<EvalsPage />} />
      </Route>
      <Route
        path="*"
        element={
          <div className="p-10 text-center">
            <p className="font-medium">Page not found</p>
            <Link to="/" className="mt-2 inline-block text-indigo-700 hover:underline">
              Go to the queue
            </Link>
          </div>
        }
      />
    </Routes>
  );
}
