import crypto from 'node:crypto';

const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const id = /^glossary\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const revision = /^revision\.glossary\.[a-f0-9]{24}$/;
const relationId = /^relation\.glossary\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const relationRevision = /^revision\.relation\.[a-f0-9]{24}$/;
const clusterId = /^cluster\.glossary\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const clusterRevision = /^revision\.cluster\.[a-f0-9]{24}$/;
const safeText = value => typeof value === 'string' && value.trim() === value && value.length > 0 &&
  value.length <= 400 && !/[<>\r\n]/.test(value) &&
  !/https?:\/\/|[A-Z]:\\|\/Users\/|\bdoi\b|\b(?:ISO|CDC|ASQ|NIST|OECD)\b|§\s*\d/i.test(value);
const fail = message => { throw Error(message); };
export const catalogHash = catalog => crypto.createHash('sha256').update(JSON.stringify(catalog.entries)).digest('hex');
export const predicates = Object.freeze({
  'is-a': { directed: true, label: 'is a kind of' },
  'distinguished-from': { directed: false, label: 'distinguished from' }
});

export function validateRelations(graph, catalog, readEntry) {
  if (!keys(graph, ['schema', 'catalog_sha256', 'profile', 'clusters', 'relations']) ||
      graph.schema !== 'qed-glossary-public-relations-v1' || graph.profile !== 'glossary-relations-v1' ||
      graph.catalog_sha256 !== catalogHash(catalog) || !Array.isArray(graph.clusters) ||
      !Array.isArray(graph.relations)) fail('Invalid or stale glossary relation snapshot');
  const pointers = new Map(catalog.entries.map(item => [item.object_id, item]));
  const checkEndpoint = endpoint => {
    if (!keys(endpoint, ['object_id', 'revision_id']) || !id.test(endpoint.object_id) ||
        !revision.test(endpoint.revision_id)) fail('Invalid relation endpoint');
    const pointer = pointers.get(endpoint.object_id);
    if (!pointer || pointer.revision_id !== endpoint.revision_id) fail('Stale or missing relation endpoint: ' + endpoint.object_id);
    const entry = readEntry(pointer.path);
    if (entry.object_id !== endpoint.object_id || entry.revision_id !== endpoint.revision_id ||
        entry.content_license !== 'CC0-1.0') fail('Relation endpoint differs from public entry');
  };
  const clusterIds = new Set();
  for (const cluster of graph.clusters) {
    if (!keys(cluster, ['cluster_id', 'revision_id', 'title', 'description', 'members']) ||
        !clusterId.test(cluster.cluster_id) || !clusterRevision.test(cluster.revision_id) ||
        !safeText(cluster.title) || !safeText(cluster.description) ||
        !Array.isArray(cluster.members) || cluster.members.length === 0 || clusterIds.has(cluster.cluster_id)) {
      fail('Invalid or duplicate glossary cluster');
    }
    clusterIds.add(cluster.cluster_id);
    const memberIds = new Set();
    for (const member of cluster.members) {
      checkEndpoint(member);
      if (memberIds.has(member.object_id)) fail('Duplicate cluster member');
      memberIds.add(member.object_id);
    }
    if (JSON.stringify(cluster.members) !== JSON.stringify([...cluster.members].sort((a, b) => a.object_id.localeCompare(b.object_id)))) {
      fail('Cluster members must be sorted');
    }
  }
  const relationIds = new Set();
  const claims = new Set();
  const taxonomy = new Map();
  for (const edge of graph.relations) {
    if (!keys(edge, ['relation_id', 'revision_id', 'source', 'target', 'predicate', 'scope', 'label', 'explanation', 'review']) ||
        !relationId.test(edge.relation_id) || !relationRevision.test(edge.revision_id) ||
        !Object.hasOwn(predicates, edge.predicate) || !safeText(edge.scope) ||
        edge.label !== predicates[edge.predicate]?.label || !safeText(edge.explanation) ||
        !keys(edge.review, ['owner_editorial', 'owner_source_attestation', 'internal_validation', 'owner_release_authorization', 'independent_external_review']) ||
        !edge.review.owner_editorial || !edge.review.owner_source_attestation ||
        !edge.review.internal_validation || !edge.review.owner_release_authorization ||
        typeof edge.review.independent_external_review !== 'boolean' || relationIds.has(edge.relation_id)) {
      fail('Invalid or unapproved glossary relation');
    }
    relationIds.add(edge.relation_id);
    checkEndpoint(edge.source);
    checkEndpoint(edge.target);
    if (edge.source.object_id === edge.target.object_id) fail('Self relation');
    if (!predicates[edge.predicate].directed && edge.source.object_id > edge.target.object_id) {
      fail('Symmetric relation endpoint order is not canonical');
    }
    const claim = [edge.source.object_id, edge.target.object_id, edge.predicate, edge.scope.toLowerCase()].join('\0');
    if (claims.has(claim)) fail('Duplicate relation claim');
    claims.add(claim);
    if (edge.predicate === 'is-a') {
      const neighbors = taxonomy.get(edge.source.object_id) ?? [];
      neighbors.push(edge.target.object_id);
      taxonomy.set(edge.source.object_id, neighbors);
    }
  }
  const seen = new Set();
  const active = new Set();
  function visit(node) {
    if (active.has(node)) fail('Taxonomic cycle');
    if (seen.has(node)) return;
    active.add(node);
    for (const next of taxonomy.get(node) ?? []) visit(next);
    active.delete(node);
    seen.add(node);
  }
  for (const node of taxonomy.keys()) visit(node);
  if (JSON.stringify(graph.clusters) !== JSON.stringify([...graph.clusters].sort((a, b) => a.cluster_id.localeCompare(b.cluster_id))) ||
      JSON.stringify(graph.relations) !== JSON.stringify([...graph.relations].sort((a, b) => a.relation_id.localeCompare(b.relation_id)))) {
    fail('Relations and clusters must be sorted');
  }
  return { clusters: graph.clusters.length, relations: graph.relations.length };
}
