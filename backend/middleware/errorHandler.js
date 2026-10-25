/**
 * Centralized error handling middleware.
 * Formats errors consistently and ensures stack traces are never leaked in production.
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Unhandled error:', err);

  const requestedStatus = Number(err.statusCode);
  const responseStatus = res.statusCode >= 400 ? res.statusCode : 500;
  const statusCode = requestedStatus >= 400 && requestedStatus <= 599
    ? requestedStatus
    : responseStatus;
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction && statusCode >= 500
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');

  res.status(statusCode).json({
    error: message,
    // Set by errors meant for the client, such as an AI spending cap.
    ...(err.publicCode ? { code: err.publicCode } : {}),
    ...(isProduction ? {} : { stack: err.stack }),
  });
};
