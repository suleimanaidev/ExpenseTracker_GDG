import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../lib/api';
import BillScanner from './BillScanner';

vi.mock('../lib/api', () => ({ default: { post: vi.fn() } }));

// The scanner is controlled: the form owns the file. A tiny harness plays that
// role so the panel can move from the dropzone to the file chip and back.
function Harness({ onScanned = vi.fn(), onBusyChange }) {
  const [file, setFile] = useState(null);
  return (
    <BillScanner
      file={file}
      onFileChange={setFile}
      onScanned={onScanned}
      onBusyChange={onBusyChange}
    />
  );
}

const pdf = (name = 'k-electric.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

const chooseFile = async (user, file) => {
  await user.upload(screen.getByLabelText(/choose a bill/i), file);
};

const refusal = (code, message) =>
  Object.assign(new Error(message), { status: 422, data: { code } });

beforeEach(() => {
  api.post.mockReset();
});

describe('BillScanner', () => {
  it('shows the dropzone until a file is chosen, then the file and a scan button', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText(/drop a bill here/i)).toBeInTheDocument();

    await chooseFile(user, pdf());

    expect(screen.getByText('k-electric.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan & autofill' })).toBeEnabled();
  });

  it('rejects a file that is too large without calling the API', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const big = pdf('huge.pdf');
    Object.defineProperty(big, 'size', { value: 9 * 1024 * 1024 });
    await chooseFile(user, big);

    expect(await screen.findByRole('alert')).toHaveTextContent(/limit is 8 MB/i);
    expect(screen.queryByText('huge.pdf')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('rejects an unsupported file type without calling the API', async () => {
    // The picker's accept filter is bypassed here to cover drag-and-drop, which
    // has no such filter.
    const user = userEvent.setup({ applyAccept: false });
    render(<Harness />);

    await chooseFile(user, new File(['hello'], 'notes.txt', { type: 'text/plain' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/JPG, PNG, WEBP or PDF/i);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('autofills from a good scan and shows confidence and warnings', async () => {
    const user = userEvent.setup();
    const onScanned = vi.fn();
    const bill = { vendor: 'K-Electric', confidence: 0.92, warnings: ['Check the due date.'] };
    api.post.mockResolvedValue({ bill });
    render(<Harness onScanned={onScanned} />);

    await chooseFile(user, pdf());
    await user.click(screen.getByRole('button', { name: 'Scan & autofill' }));

    expect(await screen.findByText('High confidence')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('Check the due date.')).toBeInTheDocument();
    expect(onScanned).toHaveBeenCalledWith(bill);
    expect(api.post).toHaveBeenCalledWith('/api/bills/scan', expect.any(FormData));
    expect(screen.getByRole('button', { name: 'Scan again' })).toBeInTheDocument();
  });

  it('labels a shaky scan as low confidence', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ bill: { vendor: 'X', confidence: 0.3, warnings: [] } });
    render(<Harness />);

    await chooseFile(user, pdf());
    await user.click(screen.getByRole('button', { name: 'Scan & autofill' }));

    expect(await screen.findByText('Low confidence')).toBeInTheDocument();
  });

  it('explains a refused file and clears it instead of attaching it', async () => {
    const user = userEvent.setup();
    const onScanned = vi.fn();
    api.post.mockRejectedValue(
      refusal(
        'NOT_A_BILL',
        'This looks like a photo of a beach, not a bill, receipt or invoice, so it was not read.'
      )
    );
    render(<Harness onScanned={onScanned} />);

    await chooseFile(user, pdf('beach.png'));
    await user.click(screen.getByRole('button', { name: 'Scan & autofill' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("This doesn't look like a bill");
    expect(alert).toHaveTextContent('a photo of a beach');

    // Nothing was applied to the form, and the rejected file is gone, so it can
    // never be uploaded as the attachment of a bill typed in by hand.
    expect(onScanned).not.toHaveBeenCalled();
    expect(screen.queryByText('beach.png')).not.toBeInTheDocument();
    expect(screen.getByText(/drop a bill here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose another file' })).toBeInTheDocument();
  });

  it('uses a different headline when nothing could be read', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue(refusal('NOTHING_READABLE', 'No bill details could be read.'));
    render(<Harness />);

    await chooseFile(user, pdf());
    await user.click(screen.getByRole('button', { name: 'Scan & autofill' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't read this document");
  });

  it('keeps the file and offers a retry when the scanner itself fails', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue(Object.assign(new Error('Gemini is busy.'), { status: 502 }));
    render(<Harness />);

    await chooseFile(user, pdf());
    await user.click(screen.getByRole('button', { name: 'Scan & autofill' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Gemini is busy.');
    expect(screen.getByText('k-electric.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('reports busy while scanning so the form cannot be saved mid-scan', async () => {
    const user = userEvent.setup();
    const onBusyChange = vi.fn();
    api.post.mockResolvedValue({ bill: { vendor: 'X', confidence: 0.9, warnings: [] } });
    render(<Harness onBusyChange={onBusyChange} />);

    await chooseFile(user, pdf());
    await user.click(screen.getByRole('button', { name: 'Scan & autofill' }));
    await screen.findByText('High confidence');

    expect(onBusyChange.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });
});
