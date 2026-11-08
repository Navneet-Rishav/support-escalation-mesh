import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../lib/auth';
import { LoginPage } from './LoginPage';
import { SubmitPage } from './SubmitPage';

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/submit" element={<SubmitPage />} />
            <Route path="/" element={<p>Queue page</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('LoginPage', () => {
  it('demo button logs in without a password and opens the queue', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(200, { token: 'jwt-token', user: { id: '1', name: 'Demo Agent', email: 'demo.agent@mesh.demo', role: 'agent' } }),
    );
    renderAt('/login');
    await userEvent.click(screen.getByRole('button', { name: /try demo as agent/i }));

    expect(await screen.findByText('Queue page')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/auth\/demo$/);
    expect(JSON.parse(String(init?.body))).toEqual({ role: 'agent' });
    expect(localStorage.getItem('mesh.token')).toBe('jwt-token');
  });

  it('shows the API error message on a failed login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(401, { error: { code: 'UNAUTHORIZED', message: 'Incorrect email or password' } }));
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.dev');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
  });

  it('shows a friendly message when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    renderAt('/login');
    await userEvent.click(screen.getByRole('button', { name: /try demo as agent/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/waking up/);
  });
});

describe('SubmitPage', () => {
  it('shows field-level validation errors from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(400, { error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid', details: [{ field: 'body', message: 'Please describe the problem in at least 10 characters' }] } }),
    );
    renderAt('/submit');
    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    expect(await screen.findByText('Please describe the problem in at least 10 characters')).toBeInTheDocument();
  });
});
