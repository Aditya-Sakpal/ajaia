import { describe, expect, it } from 'vitest';
import { joinSuggestion } from './autocomplete';

describe('joinSuggestion', () => {
  it('adds a space between a word and the suggestion', () => {
    expect(joinSuggestion('Our goals are', 'to ship the pilot.')).toBe(' to ship the pilot.');
  });
  it('does not double spaces when the text already ends with one', () => {
    expect(joinSuggestion('Our goals are ', 'to ship')).toBe('to ship');
  });
  it('attaches punctuation directly', () => {
    expect(joinSuggestion('We shipped it', ', finally.')).toBe(', finally.');
  });
  it('collapses whitespace and returns empty for blank suggestions', () => {
    expect(joinSuggestion('Hi', '  a \n b ')).toBe(' a b');
    expect(joinSuggestion('Hi', '   ')).toBe('');
  });
});
