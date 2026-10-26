const objectId = /^glossary\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const revisionId = /^revision\.glossary\.[a-f0-9]{24}$/;
const entryPath = /^entries\/[a-z0-9-]+\/[a-z0-9-]+\/revision\.glossary\.[a-f0-9]{24}\.json$/;
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const label = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 180 &&
  !/[<>\r\n]/.test(value) && !/https?:\/\/|[A-Z]:\\|\/Users\//i.test(value);

export function validateNavigation(manifest, catalog, readEntry) {
  if (!keys(manifest, ['schema', 'routes']) || manifest.schema !== 'qed-glossary-public-navigation-v1' ||
      !Array.isArray(manifest.routes)) throw Error('Invalid navigation manifest');
  const pointers = new Map(catalog.entries.map(item => [item.object_id, item]));
  const seen = new Set();
  for (const route of manifest.routes) {
    if (!keys(route, ['headword', 'scope_label', 'action', 'targets']) || !label(route.headword) ||
        !label(route.scope_label) || !['alias', 'disambiguation'].includes(route.action) ||
        !Array.isArray(route.targets) || (route.action === 'alias' ? route.targets.length !== 1 : route.targets.length < 2)) {
      throw Error('Invalid scoped navigation route');
    }
    const routeKey = `${route.headword.toLocaleLowerCase('en')}\u0000${route.scope_label.toLocaleLowerCase('en')}`;
    if (seen.has(routeKey)) throw Error('Duplicate scoped navigation route');
    seen.add(routeKey);
    const targetIds = new Set();
    for (const target of route.targets) {
      if (!keys(target, ['object_id', 'revision_id', 'path', 'headword', 'scope_label']) ||
          !objectId.test(target.object_id) || !revisionId.test(target.revision_id) ||
          !entryPath.test(target.path) || !label(target.headword) || !label(target.scope_label) ||
          targetIds.has(target.object_id)) throw Error('Invalid navigation target');
      targetIds.add(target.object_id);
      const pointer = pointers.get(target.object_id);
      if (!pointer || pointer.revision_id !== target.revision_id || pointer.path !== target.path) {
        throw Error(`Navigation target is not current in public catalog: ${target.object_id}`);
      }
      const entry = readEntry(target.path);
      if (!entry || entry.object_id !== target.object_id || entry.revision_id !== target.revision_id ||
          entry.headword !== target.headword || entry.scope_label !== target.scope_label ||
          entry.content_license !== 'CC0-1.0' || !entry.review?.owner_release_authorization) {
        throw Error(`Navigation target differs from its public entry: ${target.object_id}`);
      }
    }
  }
  const ordered = [...manifest.routes].sort((a, b) => a.headword.localeCompare(b.headword, 'en') ||
    a.scope_label.localeCompare(b.scope_label, 'en'));
  if (JSON.stringify(manifest.routes) !== JSON.stringify(ordered)) throw Error('Navigation routes are not deterministic order');
  return { routes: manifest.routes.length, entries: catalog.entries.length };
}

export function projectRoutes(dispositions, catalog, readEntry) {
  const pointers = new Map(catalog.entries.map(item => [item.object_id, item]));
  const routes = dispositions.filter(item => item.outcome === 'adopted' &&
    ['alias', 'disambiguation'].includes(item.action)).map(item => ({
    headword: item.scoped_headword,
    scope_label: item.scope_label,
    action: item.action,
    targets: item.targets.map(target => {
      const pointer = pointers.get(target.object_id);
      if (!pointer || pointer.revision_id !== target.revision_id || pointer.path !== target.public_json_path) {
        throw Error(`Disposition target is not current in public catalog: ${target.object_id}`);
      }
      const entry = readEntry(pointer.path);
      return { object_id: pointer.object_id, revision_id: pointer.revision_id, path: pointer.path,
        headword: entry.headword, scope_label: entry.scope_label };
    })
  }));
  routes.sort((a, b) => a.headword.localeCompare(b.headword, 'en') ||
    a.scope_label.localeCompare(b.scope_label, 'en'));
  const manifest = { schema: 'qed-glossary-public-navigation-v1', routes };
  validateNavigation(manifest, catalog, readEntry);
  return manifest;
}
