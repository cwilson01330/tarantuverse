// @ts-nocheck
/**
 * Expense form rules: the amount parser, the date check, the local "today", the
 * split preview copy and the edit-seeding rule. Same vectors as the Tarantuverse
 * mobile test (apps/mobile/src/lib/__tests__/expense-form.test.ts), animals only.
 *
 * This app has the jest runner (jest + jest-expo, `pnpm test`) but no
 * @types/jest, so `describe` / `expect` / `jest` have no types here and tsc
 * (which includes every .ts file) would reject them. `@ts-nocheck` keeps this
 * one file out of the type check until the types are added to devDependencies,
 * at which point the line can simply be deleted.
 */
import {
  expenseDateError,
  localToday,
  missingTargetsNote,
  monthKey,
  monthLabel,
  parseExpenseAmount,
  seedPicks,
  splitPreview,
  splitText,
} from '../expense-form';

// splitPreview pulls in the expenses lib, which imports the axios client.
jest.mock('../../services/api', () => ({
  __esModule: true,
  apiClient: { request: jest.fn() },
  default: { request: jest.fn() },
}));

describe('parseExpenseAmount', () => {
  it('accepts plain dollars and cents', () => {
    expect(parseExpenseAmount('30')).toBe(30);
    expect(parseExpenseAmount(' 30 ')).toBe(30);
    expect(parseExpenseAmount('30.5')).toBe(30.5);
    expect(parseExpenseAmount('  12.34 ')).toBe(12.34);
    expect(parseExpenseAmount('0.01')).toBe(0.01);
  });

  it('drops thousands commas (groups of exactly three digits)', () => {
    expect(parseExpenseAmount('1,250.00')).toBe(1250);
    expect(parseExpenseAmount('100,000')).toBe(100000);
    expect(parseExpenseAmount('1,234.50')).toBe(1234.5);
    expect(parseExpenseAmount('1,234')).toBe(1234);
    // Three digits after a single comma is thousands grouping, not a decimal comma.
    expect(parseExpenseAmount('12,500')).toBe(12500);
  });

  it('reads a comma followed by one or two digits as a decimal comma', () => {
    // iOS decimal-pad shows a comma key in comma-decimal locales.
    expect(parseExpenseAmount('12,50')).toBe(12.5);
    expect(parseExpenseAmount('1,5')).toBe(1.5);
    expect(parseExpenseAmount('0,50')).toBe(0.5);
  });

  it('refuses a comma that is neither grouping nor a decimal comma', () => {
    for (const bad of ['1,23,4', '1,2345', ',5', '5,', '1,234,56', '12,345,678', '1,5.5', '1.5,5', '12,5,0']) {
      expect(parseExpenseAmount(bad)).toBeNull();
    }
  });

  it('refuses anything that is not digits with at most two decimals', () => {
    for (const bad of ['', '  ', 'abc', '$5', '1e3', '0x10', '1.234', '.5', '5.', '-5', '+5', '1.2.3', '5 0']) {
      expect(parseExpenseAmount(bad)).toBeNull();
    }
  });

  it('needs more than zero and no more than 100000', () => {
    expect(parseExpenseAmount('0')).toBeNull();
    expect(parseExpenseAmount('0.00')).toBeNull();
    expect(parseExpenseAmount('100000')).toBe(100000);
    expect(parseExpenseAmount('100000.01')).toBeNull();
    expect(parseExpenseAmount('1000000')).toBeNull();
  });
});

describe('localToday', () => {
  it('uses the local calendar parts, not UTC', () => {
    // 23:30 local on the 5th is already the 6th in UTC for any zone west of it.
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(localToday(new Date(2026, 11, 31, 0, 5))).toBe('2026-12-31');
  });
});

describe('expenseDateError', () => {
  const today = '2026-10-23';

  it('accepts a real date from 1990-01-01 up to today', () => {
    expect(expenseDateError('2026-10-23', today)).toBeNull();
    expect(expenseDateError('2026-10-01', today)).toBeNull();
    expect(expenseDateError(' 2026-10-01 ', today)).toBeNull();
    expect(expenseDateError('1990-01-01', today)).toBeNull();
    expect(expenseDateError('2024-02-29', today)).toBeNull();
  });

  it('refuses text that is not YYYY-MM-DD', () => {
    for (const bad of ['', '2026-1-5', '10/23/2026', '2026/10/23', '20261023', 'today', '2026-10-23T00:00']) {
      expect(expenseDateError(bad, today)).toBe('Enter the date as YYYY-MM-DD, like 2026-10-23.');
    }
  });

  it('refuses a day that does not exist instead of rolling it over', () => {
    for (const bad of ['2026-02-31', '2026-13-01', '2026-00-10', '2026-04-31', '2025-02-29', '2026-10-00']) {
      expect(expenseDateError(bad, today)).toBe('That date does not exist. Enter it as YYYY-MM-DD.');
    }
  });

  it('refuses a date before 1990 and one after today', () => {
    expect(expenseDateError('1989-12-31', today)).toBe('Pick a date after 1990.');
    expect(expenseDateError('2026-10-24', today)).toBe('Pick a date no later than today.');
    expect(expenseDateError('2030-01-01', today)).toBe('Pick a date no later than today.');
  });

  it('accepts an unchanged saved date even when it is after today, but no other future date', () => {
    expect(expenseDateError('2026-10-24', today, '2026-10-24')).toBeNull();
    expect(expenseDateError(' 2026-10-24 ', today, '2026-10-24')).toBeNull();
    expect(expenseDateError('2026-10-25', today, '2026-10-24')).toBe('Pick a date no later than today.');
    expect(expenseDateError('2026-10-24', today, null)).toBe('Pick a date no later than today.');
    // The saved-date exemption never lets a malformed or pre-1990 value through.
    expect(expenseDateError('1989-12-31', today, '1989-12-31')).toBe('Pick a date after 1990.');
  });
});

describe('splitPreview', () => {
  it('says each when the shares are equal', () => {
    expect(splitPreview(30, 15)).toBe('$30.00 across 15 animals · $2.00 each');
  });

  it('shows largest / smallest when the pennies do not divide', () => {
    expect(splitPreview(10, 3)).toBe('$10.00 across 3 animals · $3.34 / $3.33 each');
  });

  it('has a one-animal form', () => {
    expect(splitPreview(30, 1)).toBe('$30.00 on 1 animal');
  });

  it('asks for a pick when there is none', () => {
    expect(splitPreview(30, 0)).toBe('Pick at least one animal');
  });
});

describe('splitText', () => {
  it('reads as the list row subtitle', () => {
    expect(splitText({ split_mode: 'none', share_count: 0, split_label: null })).toBe('Not split');
    expect(splitText({ split_mode: 'animals', share_count: 1, split_label: null })).toBe('Split across 1 animal');
    expect(splitText({ split_mode: 'collection', share_count: 12, split_label: null })).toBe('Split across 12 animals');
    expect(splitText({ split_mode: 'location', share_count: 4, split_label: 'Rack 2' })).toBe(
      'Split across 4 animals · Rack 2',
    );
  });
});

describe('seedPicks', () => {
  const living = ['a1', 'a2', 'a3'];

  it('picks every saved target that is still living', () => {
    const shares = [
      { target_kind: 'animal', target_id: 'a1' },
      { target_kind: 'animal', target_id: 'a3' },
    ];
    expect(seedPicks(shares, living)).toEqual({ picked: ['a1', 'a3'], missing: 0 });
  });

  it('never picks a closed or deleted target; each one is counted as missing', () => {
    const shares = [
      { target_kind: 'animal', target_id: 'a1' },
      { target_kind: 'animal', target_id: 'died-or-transferred' },
      // Deleted animal: the share is kept but its target is gone.
      { target_kind: null, target_id: null },
    ];
    expect(seedPicks(shares, living)).toEqual({ picked: ['a1'], missing: 2 });
  });

  it('only matches the animal kind', () => {
    // A TV-style invert share can't be a Herpetoverse animal, even with a living id.
    const shares = [{ target_kind: 'invert', target_id: 'a1' }];
    expect(seedPicks(shares, living)).toEqual({ picked: [], missing: 1 });
  });

  it('does not pick an id twice', () => {
    const shares = [
      { target_kind: 'animal', target_id: 'a2' },
      { target_kind: 'animal', target_id: 'a2' },
    ];
    expect(seedPicks(shares, living)).toEqual({ picked: ['a2'], missing: 0 });
  });

  it('has nothing to seed for no shares, and an empty living list leaves everything missing', () => {
    expect(seedPicks([], living)).toEqual({ picked: [], missing: 0 });
    expect(seedPicks([{ target_kind: 'animal', target_id: 'a1' }], [])).toEqual({ picked: [], missing: 1 });
  });
});

describe('missingTargetsNote', () => {
  it('is silent when nothing is missing', () => {
    expect(missingTargetsNote(0)).toBeNull();
  });

  it('uses the controller copy, singular and plural', () => {
    expect(missingTargetsNote(1)).toBe(
      '1 animal in this split is no longer in your collection. Changing the split moves the cost onto the animals you pick; leave the split unchanged to keep it as it was.',
    );
    expect(missingTargetsNote(2)).toBe(
      '2 animals in this split are no longer in your collection. Changing the split moves the cost onto the animals you pick; leave the split unchanged to keep it as it was.',
    );
    expect(missingTargetsNote(14)).toContain('14 animals in this split are no longer in your collection.');
  });
});

describe('month helpers', () => {
  it('keys and labels months', () => {
    expect(monthKey(new Date(2026, 9, 23))).toBe('2026-10');
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(monthLabel('nope')).toBe('nope');
  });
});
