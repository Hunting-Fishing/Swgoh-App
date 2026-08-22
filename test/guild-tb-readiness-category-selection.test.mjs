import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCategory,
  relevantBaseIds,
  relevantCatalogRows,
  unitCategoryKeys,
} from '../guild-tb-readiness-roster-service.mjs';

test('compact TB category normalization accepts prefixed game faction tags', () => {
  assert.equal(normalizeCategory('Mandalorian'), 'mandalorian');
  assert.equal(normalizeCategory('affiliation_mandalorian'), 'mandalorian');
  assert.equal(normalizeCategory({ id: 'faction_mandalorian' }), 'mandalorian');
  assert.equal(normalizeCategory('category_inquisitorius'), 'inquisitorius');
});

test('compact TB selector sees categories, factions and tags', () => {
  assert.deepEqual(unitCategoryKeys({ categories: ['affiliation_mandalorian'] }), ['mandalorian']);
  assert.deepEqual(unitCategoryKeys({ factions: ['Mandalorian'] }), ['mandalorian']);
  assert.deepEqual(unitCategoryKeys({ tags: [{ categoryId: 'category_inquisitorius' }] }), ['inquisitorius']);
});

test('category-only Mandalorians and Inquisitors are included in compact TB roster definition set', () => {
  const catalog = [
    { baseId: 'SABINEWRENS3', categories: ['affiliation_mandalorian'] },
    { baseId: 'SECONDINQ', categories: [{ id: 'category_inquisitorius' }] },
    { baseId: 'UNRELATED', categories: ['affiliation_jedi'] },
  ];
  const relevant = relevantCatalogRows(catalog).map((row) => row.baseId);
  assert.ok(relevant.includes('SABINEWRENS3'));
  assert.ok(relevant.includes('SECONDINQ'));
  assert.equal(relevant.includes('UNRELATED'), false);

  const ids = relevantBaseIds(catalog);
  assert.ok(ids.includes('SABINEWRENS3'));
  assert.ok(ids.includes('SECONDINQ'));
  assert.ok(ids.includes('MANDALORBOKATAN'));
  assert.ok(ids.includes('GRANDINQUISITOR'));
});
