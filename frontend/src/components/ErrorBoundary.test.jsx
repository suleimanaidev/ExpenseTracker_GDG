import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

function BrokenView() {
  throw new Error('render failed');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows a recoverable fallback when a child crashes', () => {
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Ledger could not display this page.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
});
