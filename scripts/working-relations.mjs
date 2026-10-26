import crypto from 'node:crypto';
import { catalogHash } from './relations.mjs';

const fail = message => { throw Error(message); };
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const objectId = /^glossary\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const revisionId = /^revision\.glossary\.[a-f0-9]{24}$/;
const studioId = /^edge\.dictionary-v3\.[a-z0-9.-]+$/;
const nodeId = /^[a-z][a-z0-9-]*\.dictionary-v[23](?:-[a-z0-9-]+)?\.[a-z0-9.-]+$/;
const token = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const symmetric = new Set(['distinguished-from', 'associated-with', 'related-to', 'contrasts-with', 'distinct-from']);
const inverse = new Map([['modeled-by', 'models'], ['informed-by', 'informs'],
  ['evaluated-by', 'evaluates'], ['required-by', 'requires'], ['measured-by', 'measures'],
  ['specified-by', 'specifies'], ['component-of', 'includes'], ['is-output-of', 'produces'],
  ['used-in', 'uses']]);
const claimKey = (a, b, predicate) => {
  const normalized = inverse.get(predicate) ??
    (['distinguished-from', 'contrasts-with', 'distinct-from'].includes(predicate) ? 'contrast' :
      predicate === 'subtype-of' ? 'is-a' : predicate);
  const ends = symmetric.has(predicate) ? [a, b].sort() : inverse.has(predicate) ? [b, a] : [a, b];
  return [normalized, ...ends].join('\0');
};
const pairKey = (a, b) => [a, b].sort().join('\0');

export function validateWorkingRelations(snapshot, catalog, reviewed) {
  if (!keys(snapshot, ['schema', 'catalog_sha256', 'standing', 'source_graph_sha256', 'adopted_total', 'holds', 'edges']) ||
      snapshot.schema !== 'qed-glossary-studio-working-relations-v1' ||
      snapshot.standing !== 'owner-approved-working-unvalidated' ||
      snapshot.catalog_sha256 !== catalogHash(catalog) ||
      !/^[a-f0-9]{64}$/.test(snapshot.source_graph_sha256) || !Array.isArray(snapshot.edges) ||
      !Number.isSafeInteger(snapshot.adopted_total) ||
      !keys(snapshot.holds, ['endpoint_reconciliation', 'unresolved_predicate', 'already_reviewed', 'duplicate_working']) ||
      Object.values(snapshot.holds).some(x => !Number.isSafeInteger(x) || x < 0) ||
      snapshot.adopted_total !== snapshot.edges.length + Object.values(snapshot.holds).reduce((a, b) => a + b, 0)) {
    fail('Invalid or stale Studio working snapshot');
  }
  const catalogMap = new Map(catalog.entries.map(x => [x.object_id, x.revision_id]));
  const reviewedClaims = new Set(reviewed.relations.map(e => claimKey(e.source.object_id, e.target.object_id, e.predicate)));
  const reviewedPairs = new Set(reviewed.relations.map(e => pairKey(e.source.object_id, e.target.object_id)));
  const ids = new Set();
  const claims = new Set();
  for (const edge of snapshot.edges) {
    if (!keys(edge, ['edge_id', 'source', 'target', 'source_node_id', 'target_node_id', 'predicate',
      'direction', 'modality', 'domain', 'standing', 'scope']) ||
      !studioId.test(edge.edge_id) || !nodeId.test(edge.source_node_id) || !nodeId.test(edge.target_node_id) ||
      !token.test(edge.predicate) || !token.test(edge.domain) ||
      !['source-to-target', 'symmetric', 'target-to-source'].includes(edge.direction) ||
      !token.test(edge.modality) || edge.standing !== snapshot.standing ||
      edge.scope !== 'Studio working relation; exact glossary sense and claim have not been validated.' ||
      ids.has(edge.edge_id)) fail(`Invalid or duplicate Studio working edge: ${edge.edge_id}`);
    ids.add(edge.edge_id);
    for (const endpoint of [edge.source, edge.target]) {
      if (!keys(endpoint, ['object_id', 'revision_id']) || !objectId.test(endpoint.object_id) ||
          !revisionId.test(endpoint.revision_id) || catalogMap.get(endpoint.object_id) !== endpoint.revision_id) {
        fail(`Stale Studio working endpoint: ${edge.edge_id}`);
      }
    }
    if (edge.source.object_id === edge.target.object_id) fail('Studio working self edge');
    const key = claimKey(edge.source.object_id, edge.target.object_id, edge.predicate);
    if (claims.has(key) || reviewedClaims.has(key) ||
        reviewedPairs.has(pairKey(edge.source.object_id, edge.target.object_id))) {
      fail(`Duplicate reviewed or working claim: ${edge.edge_id}`);
    }
    claims.add(key);
  }
  if (JSON.stringify(snapshot.edges) !== JSON.stringify([...snapshot.edges].sort((a, b) => a.edge_id.localeCompare(b.edge_id)))) {
    fail('Studio working edges must be sorted');
  }
  // A public snapshot cannot include private locators, citations, paths, or source text.
  if (/(?:[A-Z]:\\|\/Users\/|https?:\/\/|source_path|citation\.|doi:|§\s*\d)/i.test(JSON.stringify(snapshot))) {
    fail('Private content in Studio working snapshot');
  }
  return { working_relations: snapshot.edges.length,
    predicates: new Set(snapshot.edges.map(x => x.predicate)).size,
    graph_sha256: crypto.createHash('sha256').update(JSON.stringify(snapshot.edges)).digest('hex') };
}
