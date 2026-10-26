import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogHash, validateRelations } from './relations.mjs';

const rev = letter => `revision.glossary.${letter.repeat(24)}`;
const ids = ['glossary.quality-indicator.assessment', 'glossary.indicator.evaluation',
  'glossary.metric.evaluation'];
const catalog = { entries: ids.map((object_id, i) => ({ object_id, revision_id: rev('abc'[i]),
  path: `entries/term-${i}/scope/${rev('abc'[i])}.json` })) };
const entries = Object.fromEntries(catalog.entries.map(item => [item.path, {
  object_id: item.object_id, revision_id: item.revision_id, content_license: 'CC0-1.0'
}]));
const endpoint = i => ({ object_id: ids[i], revision_id: catalog.entries[i].revision_id });
const graph = () => ({ schema: 'qed-glossary-public-relations-v1', catalog_sha256: catalogHash(catalog),
  profile: 'glossary-relations-v1', clusters: [{ cluster_id: 'cluster.glossary.assessment',
    revision_id: `revision.cluster.${'d'.repeat(24)}`, title: 'Assessment', description: 'Terms for evaluation',
    members: [endpoint(1), endpoint(2)] }], relations: [{
      relation_id: 'relation.glossary.quality-indicator-is-a-indicator',
      revision_id: `revision.relation.${'e'.repeat(24)}`, source: endpoint(0), target: endpoint(1),
      predicate: 'is-a', scope: 'Evaluation and monitoring', label: 'is a kind of',
      explanation: 'A quality indicator is an indicator used to assess quality.',
      review: { owner_editorial: true, owner_source_attestation: true, internal_validation: true,
        owner_release_authorization: true, independent_external_review: false }
    }] });
const validate = value => validateRelations(value, catalog, file => entries[file]);

test('accepts a reviewed edge and a cluster that includes an isolated term', () => {
  assert.deepEqual(validate(graph()), { clusters: 1, relations: 1 });
});
test('rejects stale endpoint and catalog revisions', () => {
  const stale = graph(); stale.relations[0].target.revision_id = rev('f');
  assert.throws(() => validate(stale), /Stale/);
  const changed = graph(); changed.catalog_sha256 = '0'.repeat(64);
  assert.throws(() => validate(changed), /stale/);
});
test('rejects unreviewed and private relation content', () => {
  const unreviewed = graph(); unreviewed.relations[0].review.owner_source_attestation = false;
  assert.throws(() => validate(unreviewed), /unapproved/);
  const leaked = graph(); leaked.relations[0].source_path = 'C:\\private\\source.pdf';
  assert.throws(() => validate(leaked), /unapproved/);
});
test('rejects reverse symmetric duplicates and taxonomic cycles', () => {
  const duplicate = graph(); duplicate.relations.push({ ...structuredClone(duplicate.relations[0]),
    relation_id: 'relation.glossary.duplicate', revision_id: `revision.relation.${'f'.repeat(24)}` });
  assert.throws(() => validate(duplicate), /Duplicate/);
  const cycle = graph(); cycle.relations.push({ ...structuredClone(cycle.relations[0]),
    relation_id: 'relation.glossary.reverse', revision_id: `revision.relation.${'f'.repeat(24)}`,
    source: endpoint(1), target: endpoint(0) });
  cycle.relations.sort((a, b) => a.relation_id.localeCompare(b.relation_id));
  assert.throws(() => validate(cycle), /cycle/);
  const reverse = graph(); reverse.relations[0].predicate = 'distinguished-from';
  reverse.relations[0].label = 'distinguished from';
  assert.throws(() => validate(reverse), /Symmetric/);
  const mislabeled = graph(); mislabeled.relations[0].label = 'causes';
  assert.throws(() => validate(mislabeled), /unapproved/);
});
