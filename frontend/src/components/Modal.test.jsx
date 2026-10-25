import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExpenseForm } from './Modal';

const categories = [{ name: 'Food', icon: '🍕' }];

describe('ExpenseForm', () => {
  it('submits normalized expense data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ExpenseForm categories={categories} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText('Amount'), '1250');
    await user.type(screen.getByLabelText('Note'), '  Lunch  ');
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1250,
        category: 'Food',
        note: 'Lunch',
      })
    );
  });

  it('keeps the form available and displays an API failure', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('Server unavailable'));
    render(<ExpenseForm categories={categories} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText('Amount'), '50');
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
    expect(screen.getByRole('button', { name: 'Add Expense' })).toBeEnabled();
  });
});
