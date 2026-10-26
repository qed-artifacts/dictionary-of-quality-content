import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStudioNavigation } from './studio-navigation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json')));
const projection = JSON.parse(fs.readFileSync(path.join(root, 'relations/studio-navigation.v1.json')));
const clone = value => structuredClone(value);

test('released endpoints, source IDs, direction, and facet reconcile', () => {
  const counts = validateStudioNavigation(projection, catalog);
  assert.equal(counts.definition_routes, 2301);
  assert.equal(counts.coverage_targets, 582);
  assert.equal(counts.studio_assertions, 2901);
  assert.equal(new Set(projection.definition_routes.flatMap(route =>
    [route.source.object_id, route.target.object_id])).size > 261, true);
});

test('stale revisions and private provenance cannot enter public navigation', () => {
  const stale = clone(projection);
  stale.definition_routes[0].source.revision_id = 'revision.glossary.' + '0'.repeat(24);
  assert.throws(() => validateStudioNavigation(stale, catalog), /Invalid definition route/);
  const leaked = clone(projection);
  leaked.definition_routes[0].source_node_id = 'C:\\Users\\Private';
  assert.throws(() => validateStudioNavigation(leaked, catalog), /Invalid definition route|Private data/);
});

test('duplicate routes and coverage are kept in their distinct roles', () => {
  const duplicate = clone(projection);
  duplicate.definition_routes.push(clone(duplicate.definition_routes[0]));
  assert.throws(() => validateStudioNavigation(duplicate, catalog), /Invalid definition route|Duplicate definition route/);
  const falseSemantic = clone(projection);
  falseSemantic.coverage.standing = 'owner-approved-working-unvalidated';
  assert.throws(() => validateStudioNavigation(falseSemantic, catalog), /Invalid coverage facet/);
});
