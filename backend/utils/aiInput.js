const WORD_NUMBERS = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
  'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
  'ten': 10, 'hundred': 100, 'thousand': 1000,
};

export const normalizeAmount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const input = value.trim().toLowerCase();
  if (!input) return null;
  const cleaned = input
    .replace(/(?:rs\.?|pkr|₨|rupees?)\s*/gi, '')
    .replace(/,/g, '')
    .trim();
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (match) {
    const number = Number(match[0]);
    if (!Number.isFinite(number) || number <= 0) return null;
    if (/(?:k|thousand)$/.test(cleaned)) return number * 1000;
    if (/\blakh\b|\blac\b/.test(cleaned)) return number * 100000;
    return number;
  }
  const words = cleaned.split(/\s+/);
  if (cleaned.includes('dedh hazar') || cleaned.includes('derh hazar')) return 1500;
  if (cleaned.includes('do sau')) return 200;
  const values = words.map((word) => WORD_NUMBERS[word]).filter((number) => number !== undefined);
  if (values.length === 0) return null;
  return values.reduce((total, number) => (number >= 100 ? total * number : total + number), 0) || null;
};

export const resolveRelativeDate = (value, now = new Date()) => {
  if (!value) return now.toISOString().slice(0, 10);
  const input = String(value).trim().toLowerCase();
  const date = new Date(now);
  if (input === 'kal' || input === 'yesterday') date.setDate(date.getDate() - 1);
  else if (input === 'parson' || input === 'day before yesterday') date.setDate(date.getDate() - 2);
  else if (input === 'aaj' || input === 'today') return date.toISOString().slice(0, 10);
  else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  else {
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return now.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
};

export const isAllowedAttachment = (file) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  return Boolean(file && allowed.includes(file.type) && file.size <= 8 * 1024 * 1024);
};
