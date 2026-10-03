import { AuditLog } from '../models/AuditLog.js';

const MAX_METADATA_KEYS = 20;

const sanitizeMetadata = (metadata = {}) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => (
        !/password|token|secret|prompt|content|response/i.test(key)
        && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null)
      ))
      .slice(0, MAX_METADATA_KEYS)
  );
};

export const writeAuditLog = async ({
  actor,
  action,
  targetType,
  targetId = null,
  metadata = {},
  req,
}) => {
  if (!actor || !action || !targetType) {
    throw new Error('Audit log actor, action, and target type are required');
  }

  return AuditLog.create({
    actor,
    action,
    targetType,
    targetId,
    metadata: sanitizeMetadata(metadata),
    ip: req?.ip || req?.socket?.remoteAddress || null,
    userAgent: req?.get?.('user-agent') || null,
  });
};
