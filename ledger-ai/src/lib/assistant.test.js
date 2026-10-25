import { describe, expect, it } from 'vitest';
import { replyTo } from './assistant.js';

describe('replyTo', () => {
  it('answers category questions from the data', () => {
    expect(replyTo('How much on food?')).toContain('PKR 18,400');
  });

  it('flags a category over budget', () => {
    expect(replyTo('utilities')).toContain('over');
  });

  it('reports the remaining budget', () => {
    expect(replyTo('budget left')).toContain('PKR 7,400');
  });

  it('falls back politely', () => {
    expect(replyTo('hello there')).toContain('I can answer');
  });
});
