import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../lib/api';
import Sidebar from '../components/Sidebar';
import Transactions from './Transactions';

const reload = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('../lib/DataContext', () => ({
  useData: () => ({
    entries: [],
    categories: [{ name: 'Food', icon: 'F' }],
    currency: 'PKR',
    addEntry: vi.fn(),
    updateEntry: vi.fn(),
    removeEntry: vi.fn(),
    reload,
    loaded: true,
    filterCat: 'All',
    setFilterCat: vi.fn(),
    search: '',
    setSearch: vi.fn(),
    sortBy: 'date-desc',
    setSortBy: vi.fn(),
    dateFrom: '',
    setDateFrom: vi.fn(),
    dateTo: '',
    setDateTo: vi.fn(),
  }),
}));

vi.mock('../lib/ToastContext', () => ({ useToast: () => ({ notify: vi.fn() }) }));

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: {}, signOut: vi.fn() }),
}));

function Where() {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{pathname + search}</div>;
}

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Where />
      <Routes>
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/bills" element={<Navigate to="/transactions?view=bills" replace />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) =>
    Promise.resolve(
      url.startsWith('/api/bills/summary') ? { summary: null } : { bills: [], pages: 1, total: 0 }
    )
  );
});

describe('Transactions page tabs', () => {
  it('defaults to Transactions and offers only Add Expense', async () => {
    renderAt('/transactions');

    expect(screen.getByRole('tab', { name: 'Transactions' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('button', { name: /Add Expense/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Bill/ })).not.toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
  });

  it('switches to Bills, updates ?view= and offers only Add Bill', async () => {
    const user = userEvent.setup();
    renderAt('/transactions');

    await user.click(screen.getByRole('tab', { name: 'Bills' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/transactions?view=bills');
    expect(screen.getByRole('tab', { name: 'Bills' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Bills' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Add Expense/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Bill/ })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Transactions' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/transactions$/);
  });

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    renderAt('/transactions');

    screen.getByRole('tab', { name: 'Transactions' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Bills' })).toHaveFocus();
    expect(screen.getByTestId('where')).toHaveTextContent('view=bills');
  });

  it('opens on Bills when the URL asks for it, and /bills redirects there', async () => {
    renderAt('/bills');

    expect(screen.getByTestId('where')).toHaveTextContent('/transactions?view=bills');
    expect(screen.getByRole('tab', { name: 'Bills' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the bill form with the upload dropzone from Add Bill', async () => {
    const user = userEvent.setup();
    renderAt('/transactions?view=bills');

    await user.click(screen.getByRole('button', { name: /Add Bill/ }));

    expect(await screen.findByText(/Drop a bill here/i)).toBeInTheDocument();
  });
});

describe('Sidebar', () => {
  it('has no Bills item and keeps Transactions active on any view', () => {
    render(
      <MemoryRouter initialEntries={['/transactions?view=bills']}>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: /^Bills$/ })).not.toBeInTheDocument();
    screen
      .getAllByRole('link', { name: 'Transactions' })
      .forEach((link) => expect(link.className).toMatch(/--active/));
  });
});
