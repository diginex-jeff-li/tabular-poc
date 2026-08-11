import { describe, it, expect } from 'vitest';
import {
  parseChoices,
  isReservedName,
  isDuplicateName,
  hasValidChoices,
} from './columnValidation';

describe('parseChoices', () => {
  it('splits on commas, trims, and drops empties', () => {
    expect(parseChoices(' Apple , Banana ')).toEqual(['Apple', 'Banana']);
  });

  it('drops empty entries from trailing commas', () => {
    expect(parseChoices('a, ,b,')).toEqual(['a', 'b']);
  });

  it('returns a single choice', () => {
    expect(parseChoices('Only')).toEqual(['Only']);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseChoices('')).toEqual([]);
  });

  it('returns an empty array for only commas and spaces', () => {
    expect(parseChoices(', , ,')).toEqual([]);
  });
});

describe('isReservedName', () => {
  it('returns true for each reserved name (case-insensitive)', () => {
    expect(isReservedName('id')).toBe(true);
    expect(isReservedName('ID')).toBe(true);
    expect(isReservedName('createdAt')).toBe(true);
    expect(isReservedName('CREATEDAT')).toBe(true);
    expect(isReservedName('updatedAt')).toBe(true);
    expect(isReservedName('updatedAt')).toBe(true);
    expect(isReservedName('__select')).toBe(true);
    expect(isReservedName('__SELECT')).toBe(true);
  });

  it('trims whitespace before checking', () => {
    expect(isReservedName('  id  ')).toBe(true);
  });

  it('returns false for a non-reserved name', () => {
    expect(isReservedName('Status')).toBe(false);
    expect(isReservedName('Title')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isReservedName('')).toBe(false);
    expect(isReservedName('   ')).toBe(false);
  });
});

describe('isDuplicateName', () => {
  it('returns true for an exact match', () => {
    expect(isDuplicateName('Name', ['Name', 'Score'])).toBe(true);
  });

  it('returns true for a case-insensitive match', () => {
    expect(isDuplicateName('name', ['Name', 'Score'])).toBe(true);
    expect(isDuplicateName('NAME', ['Name'])).toBe(true);
  });

  it('returns true when the new name has trailing whitespace', () => {
    expect(isDuplicateName('Status ', ['Status', 'Score'])).toBe(true);
  });

  it('returns true when an existing name has trailing whitespace', () => {
    expect(isDuplicateName('Status', ['Status ', 'Score'])).toBe(true);
  });

  it('returns false when the name is not in the existing list', () => {
    expect(isDuplicateName('Notes', ['Name', 'Score'])).toBe(false);
  });

  it('returns false for an empty existing list', () => {
    expect(isDuplicateName('Name', [])).toBe(false);
  });

  it('returns false for an empty name (empty is not a duplicate)', () => {
    expect(isDuplicateName('', ['Name'])).toBe(false);
    expect(isDuplicateName('  ', ['Name'])).toBe(false);
  });
});

describe('hasValidChoices', () => {
  it('returns true for a string with at least one non-empty choice', () => {
    expect(hasValidChoices('Low, Medium, High')).toBe(true);
  });

  it('returns true for a single choice', () => {
    expect(hasValidChoices('Only')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(hasValidChoices('')).toBe(false);
  });

  it('returns false for only commas and spaces', () => {
    expect(hasValidChoices(', , ,')).toBe(false);
  });
});
