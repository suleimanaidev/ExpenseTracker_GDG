/**
 * Buckets a 0..1 scan confidence into a label and a style key, so the scanner
 * panel and the chat review card describe the same score the same way.
 */
export function confidenceLevel(score) {
  const value = Number(score) || 0;
  if (value >= 0.85) return { key: 'high', label: 'High confidence' };
  if (value >= 0.6) return { key: 'medium', label: 'Medium confidence' };
  return { key: 'low', label: 'Low confidence' };
}
