import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { validateNavigation } from "./navigation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (message) => { throw new Error(message); };
const read = async (name) => JSON.parse(await fs.readFile(path.join(root, name), "utf8"));
const catalog = await read("catalog.json");
const exactKeys = (value, allowed) => value && typeof value === "object" &&
  Object.keys(value).length === allowed.length && allowed.every((key) => Object.hasOwn(value, key));
if (catalog.schema !== "qed-glossary-public-catalog-v1" || !Array.isArray(catalog.entries) ||
  !exactKeys(catalog, ["schema", "entries"])) fail("Invalid public catalog");
const ids = new Set();
const files = new Set();
for (const entry of catalog.entries) {
  if (!exactKeys(entry, ["object_id", "revision_id", "path"]) ||
    !/^glossary\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(entry.object_id) ||
    !/^revision\.glossary\.[a-f0-9]{24}$/.test(entry.revision_id) ||
    !/^entries\/[a-z0-9-]+\/[a-z0-9-]+\/revision\.glossary\.[a-f0-9]{24}\.json$/.test(entry.path) ||
    ids.has(entry.object_id) || files.has(entry.path)) fail("Invalid or duplicate catalog pointer");
  ids.add(entry.object_id);
  files.add(entry.path);
  const value = await read(entry.path);
  if (value.object_id !== entry.object_id || value.revision_id !== entry.revision_id) fail("Catalog points to a different object revision");
}
const entriesRoot = path.join(root, "entries");
let count = 0;
async function walk(directory) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) { await walk(full); continue; }
    if (!item.name.endsWith(".json")) continue;
    const relative = path.relative(root, full).replaceAll("\\", "/");
    if (!/^entries\/[a-z0-9-]+\/[a-z0-9-]+\/revision\.glossary\.[a-f0-9]{24}\.json$/.test(relative)) fail("Unrecognized entry path: " + relative);
    const value = await read(relative);
    if (!exactKeys(value, ["schema", "object_id", "revision_id", "headword", "scope_label", "definition",
      "explanation", "content_license", "review"]) ||
      value.schema !== "qed-glossary-public-object-v1" || value.content_license !== "CC0-1.0" ||
      !/^glossary\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value.object_id) ||
      value.revision_id + ".json" !== item.name ||
      !value.headword?.trim() || !value.scope_label?.trim() || !value.definition?.trim() ||
      !Array.isArray(value.explanation) || !value.explanation.length ||
      value.explanation.some((part) => typeof part !== "string" || !part.trim()) ||
      /https?:\/\/|\bdoi\s*:\s*10\.|§\s*\d|\b(?:ISO(?:\/IEC)?|CDC|CMS|ASQ|NIST|OECD|Baldrige)\b|\([^)]{0,80}\b(?:19|20)\d{2}\b[^)]*\)/i.test([value.definition, ...value.explanation].join("\n")) ||
      !exactKeys(value.review, ["owner_editorial", "owner_source_attestation", "internal_validation",
        "owner_release_authorization", "independent_external_review"]) ||
      !value.review?.owner_editorial || !value.review?.owner_source_attestation ||
      !value.review?.internal_validation || !value.review?.owner_release_authorization ||
      typeof value.review?.independent_external_review !== "boolean") {
      fail("Invalid or private entry content: " + relative);
    }
    const markdown = full.slice(0, -5) + ".md";
    const prose = await fs.readFile(markdown, "utf8");
    if (!prose.includes(value.definition) || !prose.includes("CC0 1.0") ||
      /## References|https?:\/\/|§\s*\d|(?:[A-Z]:\\Users\\|\/Users\/|OneDrive|source_path|literal_passage)/i.test(prose)) {
      fail("Markdown does not match the public object or contains a private locator: " + relative);
    }
    count += 1;
  }
}
try { await walk(entriesRoot); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let navigationRoutes = 0;
try {
  const navigation = await read("navigation.json");
  navigationRoutes = validateNavigation(navigation, catalog,
    relative => JSON.parse(readFileSync(path.join(root, relative), "utf8"))).routes;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
console.log(JSON.stringify({ status: "valid", current_objects: catalog.entries.length,
  versioned_objects: count, navigation_routes: navigationRoutes }));
