import {
  sacStatus,
  sacStatusLabel,
  splitCapText,
  splitMax,
  splitNoun,
} from '../broods';
import { broodBucket, countsPrey, hatchButtonLabel, isLiveBirth, taxonHasModule, breedingVocabulary } from '../taxon-modules';

describe('registry', () => {
  it('buttons and buckets', () => {
    expect(hatchButtonLabel('mantis')).toBe('Hatched: start a nymph group');
    expect(hatchButtonLabel('tarantula')).toBe('Hatched: start a sling group');
    expect(hatchButtonLabel('true_spider')).toBe('Hatched: start a sling group');
    expect(hatchButtonLabel('scorpion')).toBe('Start a scorpling group');
    expect(broodBucket('true_spider')).toBe('slings');
    expect(broodBucket('tarantula')).toBe('slings');
    expect(broodBucket('mantis')).toBe('nymphs');
    expect(broodBucket('scorpion')).toBe('scorplings');
    expect(broodBucket('roach')).toBe('young');
  });
  it('live birth and prey counting', () => {
    expect(isLiveBirth('scorpion')).toBe(true);
    expect(isLiveBirth('tarantula')).toBe(false);
    expect(breedingVocabulary('scorpion').liveBirth?.offspring).toBe('scorplings');
    expect(countsPrey('true_spider')).toBe(true);
    expect(countsPrey('mantis')).toBe(true);
    expect(countsPrey('tarantula')).toBe(false);
  });
  it('eggSacs module', () => {
    expect(taxonHasModule('mantis', 'eggSacs')).toBe(true);
    expect(taxonHasModule('roach', 'eggSacs')).toBe(false);
  });
});

describe('sac status', () => {
  it('derives from outcome and group', () => {
    expect(sacStatus({ outcome: null, hatched_colony: null })).toBe('waiting');
    expect(sacStatus({ outcome: 'hatched', hatched_colony: { id: 'a', name: 'x' } })).toBe('hatched');
    expect(sacStatus({ outcome: 'hatched', hatched_colony: null })).toBe('hatched_removed');
    expect(sacStatus({ outcome: 'failed', hatched_colony: null })).toBe('failed');
  });
  it('labels', () => {
    expect(sacStatusLabel('waiting', false)).toBe('Waiting');
    expect(sacStatusLabel('waiting', true)).toBe('Not grouped yet');
    expect(sacStatusLabel('hatched', false)).toBe('Hatched');
    expect(sacStatusLabel('hatched', true)).toBe('Grouped');
    expect(sacStatusLabel('hatched_removed', false)).toBe('Hatched (group removed)');
    expect(sacStatusLabel('failed', true)).toBe("Didn't hatch");
  });
});

describe('split', () => {
  it('caps and words', () => {
    expect(splitMax(73)).toBe(50);
    expect(splitMax(12)).toBe(12);
    expect(splitMax(-3)).toBe(0);
    expect(splitNoun('true_spider')).toBe('spiders');
    expect(splitNoun('mantis')).toBe('mantids');
    expect(splitNoun('scorpion')).toBe('scorpions');
    expect(splitNoun('roach')).toBe('animals');
    expect(splitCapText(4)).toBe('You can add 4 more on the free plan');
    expect(splitCapText(0)).toBe("You're at the free plan's limit");
  });
});
