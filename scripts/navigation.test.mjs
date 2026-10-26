import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRoutes, validateNavigation } from './navigation.mjs';

const revisions = ['revision.glossary.' + 'a'.repeat(24), 'revision.glossary.' + 'b'.repeat(24)];
const paths = revisions.map((revision, index) => `entries/term-${index}/scope/${revision}.json`);
const catalog = { entries: [0, 1].map(index => ({ object_id: `glossary.term-${index}.scope`,
  revision_id: revisions[index], path: paths[index] })) };
const entries = Object.fromEntries(paths.map((file, index) => [file, {
  object_id: catalog.entries[index].object_id, revision_id: revisions[index],
  headword: `Term ${index}`, scope_label: `scope ${index}`, content_license: 'CC0-1.0',
  review: { owner_release_authorization: true }
}]));
const read = file => entries[file];
const disposition = (action, targets) => ({ outcome: 'adopted', action, scoped_headword: 'Other term',
  scope_label: 'bounded context', targets: targets.map(index => ({ object_id: catalog.entries[index].object_id,
    revision_id: revisions[index], public_json_path: paths[index] })) });

test('projects only scoped active navigation to current released entries', () => {
  const result = projectRoutes([disposition('alias', [0]),
    { ...disposition('alias', [0]), outcome: 'reversed' },
    disposition('retire-from-active-queue', [])], catalog, read);
  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].targets[0].headword, 'Term 0');
  assert.equal(validateNavigation(result, catalog, read).entries, 2);
});

test('disambiguation retains two distinct choices', () => {
  const result = projectRoutes([disposition('disambiguation', [0, 1])], catalog, read);
  assert.deepEqual(result.routes[0].targets.map(target => target.headword), ['Term 0', 'Term 1']);
});

test('rejects stale target revisions and private fields', () => {
  const stale = disposition('alias', [0]);
  stale.targets[0].revision_id = revisions[1];
  assert.throws(() => projectRoutes([stale], catalog, read), /not current/);
  const valid = projectRoutes([disposition('alias', [0])], catalog, read);
  valid.routes[0].source_note_references = ['private/path'];
  assert.throws(() => validateNavigation(valid, catalog, read), /Invalid scoped/);
});

test('rejects ambiguous unscoped and duplicate routes', () => {
  const valid = projectRoutes([disposition('alias', [0])], catalog, read);
  valid.routes[0].scope_label = '';
  assert.throws(() => validateNavigation(valid, catalog, read), /Invalid scoped/);
  const doubled = projectRoutes([disposition('alias', [0])], catalog, read);
  doubled.routes.push(structuredClone(doubled.routes[0]));
  assert.throws(() => validateNavigation(doubled, catalog, read), /Duplicate/);
});
