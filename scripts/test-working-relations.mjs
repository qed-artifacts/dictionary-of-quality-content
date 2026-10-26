import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateWorkingRelations } from './working-relations.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url)));
const reviewed = JSON.parse(fs.readFileSync(new URL('../relations/graph.v1.json', import.meta.url)));
const snapshot = JSON.parse(fs.readFileSync(new URL('../relations/studio-working.v1.json', import.meta.url)));
const copy = () => structuredClone(snapshot);

test('adopted working layer remains distinct from reviewed releases', () => {
  const result = validateWorkingRelations(snapshot, catalog, reviewed);
  assert.equal(result.working_relations, 539);
  assert.equal(snapshot.adopted_total, 734);
  assert.deepEqual(snapshot.holds, { endpoint_reconciliation: 31, unresolved_predicate: 156, duplicate_working: 8 });
  assert.equal(reviewed.relations.length, 11);
});

test('rejects stale endpoint, duplicate and private locator', () => {
  const stale = copy();
  stale.edges[0].source.revision_id = 'revision.glossary.' + '0'.repeat(24);
  assert.throws(() => validateWorkingRelations(stale, catalog, reviewed), /Stale/);
  const duplicate = copy();
  duplicate.edges[1].source = duplicate.edges[0].source;
  duplicate.edges[1].target = duplicate.edges[0].target;
  duplicate.edges[1].predicate = duplicate.edges[0].predicate;
  assert.throws(() => validateWorkingRelations(duplicate, catalog, reviewed), /Duplicate/);
  const privatePath = copy();
  privatePath.edges[0].edge_id = 'C:\\Users\\secret';
  assert.throws(() => validateWorkingRelations(privatePath, catalog, reviewed), /Invalid/);
});
