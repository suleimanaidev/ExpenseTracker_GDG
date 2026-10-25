import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/errorHandler.js';

function createResponse(initialStatus = 200) {
  return {
    statusCode: initialStatus,
    status: vi.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(),
  };
}

describe('errorHandler', () => {
  const originalEnvironment = process.env.NODE_ENV;

  afterEach(() => {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    vi.restoreAllMocks();
  });

  it('preserves an explicit operational status code', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = createResponse();
    const error = Object.assign(new Error('Missing record'), { statusCode: 404 });

    errorHandler(error, {}, response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Missing record' }));
  });

  it('uses a status already assigned by the controller', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = createResponse(422);

    errorHandler(new Error('Invalid input'), {}, response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(422);
  });

  it('does not expose internal errors or stack traces in production', () => {
    process.env.NODE_ENV = 'production';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = createResponse();

    errorHandler(new Error('database password appeared here'), {}, response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
  });
});
