export const DEFAULT_CATEGORIES = [
  { name: 'Food',      color: '#E4DDD3', icon: '🍕' },
  { name: 'Transport', color: '#00A19B', icon: '🚗' },
  { name: 'Bills',     color: '#B5493B', icon: '📄' },
  { name: 'Shopping',  color: '#6E7FB5', icon: '🛍️' },
  { name: 'Health',    color: '#9B6FA6', icon: '💊' },
  { name: 'Other',     color: '#7A8288', icon: '📦' },
];

export function getCategoryColor(categories, name) {
  const cat = categories.find(c => c.name === name);
  return cat ? cat.color : '#7A8288';
}

export function getCategoryIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('rent') || n.includes('home') || n.includes('house') || n.includes('room') || n.includes('apartment') || n.includes('flat') || n.includes('stay')) return '🏠';
  if (n.includes('coffee') || n.includes('tea') || n.includes('cafe') || n.includes('starbucks') || n.includes('chai') || n.includes('drink')) return '☕';
  if (n.includes('movie') || n.includes('cinema') || n.includes('netflix') || n.includes('show') || n.includes('entertainment') || n.includes('game') || n.includes('gaming') || n.includes('fun') || n.includes('play')) return '🎬';
  if (n.includes('travel') || n.includes('flight') || n.includes('trip') || n.includes('hotel') || n.includes('tour') || n.includes('vacation')) return '✈️';
  if (n.includes('grocer') || n.includes('supermarket') || n.includes('mart') || n.includes('market') || n.includes('ration') || n.includes('sauda')) return '🛒';
  if (n.includes('gym') || n.includes('workout') || n.includes('fit') || n.includes('sport') || n.includes('run') || n.includes('exercise')) return '💪';
  if (n.includes('pet') || n.includes('dog') || n.includes('cat') || n.includes('animal')) return '🐾';
  if (n.includes('gift') || n.includes('present') || n.includes('birthday') || n.includes('anniversary')) return '🎁';
  if (n.includes('school') || n.includes('book') || n.includes('college') || n.includes('uni') || n.includes('education') || n.includes('course') || n.includes('study')) return '📚';
  if (n.includes('salary') || n.includes('income') || n.includes('freelance') || n.includes('invest') || n.includes('earn') || n.includes('cash')) return '💵';
  if (n.includes('car') || n.includes('bike') || n.includes('cycle') || n.includes('taxi') || n.includes('uber') || n.includes('ride') || n.includes('careem') || n.includes('indrive')) return '🚗';
  if (n.includes('shop') || n.includes('cloth') || n.includes('fashion') || n.includes('shoe') || n.includes('dress') || n.includes('buying')) return '🛍️';
  if (n.includes('sub') || n.includes('spotify') || n.includes('youtube') || n.includes('prime') || n.includes('membership')) return '📱';
  if (n.includes('insur') || n.includes('insure') || n.includes('tax') || n.includes('loan') || n.includes('debt') || n.includes('interest')) return '🛡️';
  if (n.includes('salon') || n.includes('hair') || n.includes('spa') || n.includes('beauty') || n.includes('makeup') || n.includes('parlor')) return '💇';
  if (n.includes('med') || n.includes('doc') || n.includes('pharm') || n.includes('hospital') || n.includes('health') || n.includes('ill') || n.includes('sick')) return '💊';
  if (n.includes('food') || n.includes('eat') || n.includes('lunch') || n.includes('dinner') || n.includes('breakfast') || n.includes('restaurant')) return '🍕';
  if (n.includes('bill') || n.includes('utility') || n.includes('electric') || n.includes('gas') || n.includes('water') || n.includes('internet') || n.includes('wifi') || n.includes('phone') || n.includes('mobile')) return '📄';
  return '🏷️';
}

export function formatCurrency(amount, currency = 'PKR') {
  const symbols = { PKR: 'PKR ', USD: '$', EUR: '€', GBP: '£', INR: '₹' };
  const prefix = symbols[currency] || currency + ' ';
  return prefix + Math.abs(amount).toLocaleString('en-IN');
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
