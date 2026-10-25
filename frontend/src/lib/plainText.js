/**
 * The assistant is instructed to answer in plain text, but small models still
 * slip markdown in. These panels render raw strings, so a stray `**Food**`
 * would appear literally and make a conversational reply look like machine
 * output. Normalise it for display instead of trusting the prompt alone.
 */
export function toPlainText(value) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold**
    .replace(/__(.+?)__/g, '$1') // __bold__
    .replace(/`([^`]+)`/g, '$1') // `code`
    .replace(/^\s*[-*+]\s+/gm, '• ') // list markers
    .replace(/^\s*>\s?/gm, '') // block quotes
    .replace(/\*\*/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
