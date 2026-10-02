/**
 * Generic request validation middleware using Zod schemas.
 * Validates body, query, and params.
 */
export const validate = (schema) => (req, res, next) => {
  try {
    if (schema.body) {
      req.body = schema.body.parse(req.body);
    }
    if (schema.query) {
      req.query = schema.query.parse(req.query);
    }
    if (schema.params) {
      req.params = schema.params.parse(req.params);
    }
    next();
  } catch (err) {
    if (err.name === 'ZodError') {
      const issues = err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(400).json({
        error: issues[0]?.message || 'Validation error',
        details: issues,
      });
    }
    next(err);
  }
};
