import crypto from 'node:crypto';

const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === allowed.length && allowed.every(key => Object.hasOwn(value, key));
const id = /^glossary\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const revision = /^revision\.glossary\.[a-f0-9]{24}$/;
const studioEdge = /^edge\.dictionary-v3\.[a-z0-9.-]+$/;
const node = /^[a-z][a-z0-9-]*\.dictionary-v[23](?:-[a-z0-9-]+)?\.[a-z0-9.-]+$/;
const endpointValid = (value, catalog) => keys(value, ['object_id', 'revision_id']) &&
  id.test(value.object_id) && revision.test(value.revision_id) &&
  catalog.get(value.object_id) === value.revision_id;
const fail = message => { throw Error(message); };

export function validateStudioNavigation(snapshot, catalog) {
  if (!keys(snapshot, ['schema', 'catalog_sha256', 'source_graph_sha256', 'standing',
    'quality_anchor', 'definition_routes', 'coverage']) ||
    snapshot.schema !== 'qed-glossary-studio-navigation-v1' ||
    snapshot.catalog_sha256 !== sha(catalog.entries) ||
    !/^[a-f0-9]{64}$/.test(snapshot.source_graph_sha256) ||
    snapshot.standing !== 'studio-editorial-navigation-unvalidated' ||
    !Array.isArray(snapshot.definition_routes)) fail('Invalid or stale Studio navigation projection');
  const current = new Map(catalog.entries.map(entry => [entry.object_id, entry.revision_id]));
  const quality = 'glossary.quality.quality-management';
  if (!endpointValid(snapshot.quality_anchor, current) || snapshot.quality_anchor.object_id !== quality) {
    fail('Invalid Quality anchor');
  }
  if (!keys(snapshot.coverage, ['predicate', 'anchor', 'standing', 'targets']) ||
    snapshot.coverage.predicate !== 'coverage-candidate-for' ||
    snapshot.coverage.standing !== 'configured-coverage-candidate-not-semantic' ||
    JSON.stringify(snapshot.coverage.anchor) !== JSON.stringify(snapshot.quality_anchor) ||
    !Array.isArray(snapshot.coverage.targets)) fail('Invalid coverage facet');
  const edgeIds = new Set();
  const pairKeys = new Set();
  for (const route of snapshot.definition_routes) {
    if (!keys(route, ['source', 'target', 'source_node_id', 'target_node_id', 'predicate',
      'direction', 'modality', 'standing', 'source_edge_ids']) ||
      !endpointValid(route.source, current) || !endpointValid(route.target, current) ||
      route.source.object_id === route.target.object_id ||
      !node.test(route.source_node_id) || !node.test(route.target_node_id) ||
      route.predicate !== 'definition-mentions' || route.direction !== 'source-to-target' ||
      route.modality !== 'asserted' || route.standing !== 'studio-derived-navigation-unvalidated' ||
      !Array.isArray(route.source_edge_ids) || !route.source_edge_ids.length ||
      route.source_edge_ids.some(value => !studioEdge.test(value) || edgeIds.has(value))) {
      fail('Invalid definition route');
    }
    route.source_edge_ids.forEach(value => edgeIds.add(value));
    const key = `${route.source.object_id}\0${route.target.object_id}`;
    if (pairKeys.has(key)) fail('Duplicate definition route');
    pairKeys.add(key);
  }
  const targets = new Set();
  for (const item of snapshot.coverage.targets) {
    if (!keys(item, ['target', 'source_edge_ids']) || !endpointValid(item.target, current) ||
      targets.has(item.target.object_id) || !Array.isArray(item.source_edge_ids) ||
      !item.source_edge_ids.length || item.source_edge_ids.some(value =>
        !studioEdge.test(value) || edgeIds.has(value))) fail('Invalid coverage target');
    targets.add(item.target.object_id);
    item.source_edge_ids.forEach(value => edgeIds.add(value));
  }
  const sorted = array => JSON.stringify(array) === JSON.stringify([...array].sort((a, b) =>
    a.localeCompare(b)));
  if (!sorted(snapshot.definition_routes.map(route => `${route.source.object_id}\0${route.target.object_id}`)) ||
      !sorted(snapshot.coverage.targets.map(item => item.target.object_id)) ||
      snapshot.definition_routes.some(route => !sorted(route.source_edge_ids)) ||
      snapshot.coverage.targets.some(item => !sorted(item.source_edge_ids))) fail('Unstable navigation ordering');
  if (/(?:[A-Z]:\\|\/Users\/|https?:\/\/|source_path|citation\.|doi:|§\s*\d|provenance_refs|literal_passage)/i.test(JSON.stringify(snapshot))) {
    fail('Private data in Studio navigation projection');
  }
  return { definition_routes: snapshot.definition_routes.length,
    coverage_targets: snapshot.coverage.targets.length,
    studio_assertions: edgeIds.size };
}
