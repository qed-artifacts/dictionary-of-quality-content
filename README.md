# Dictionary of Quality · released glossary collection

This public GitHub repository contains **released glossary objects** as versioned JSON and readable Markdown. It is separate from the Dictionary website at qedartifacts.org. An entry appearing here does not put a page on that website.

The private Dictionary of Quality publication store holds drafts, source review, decisions, rights checks, and exact release manifests. Only approved public output reaches this repository through a reviewed pull request. The root catalog.json lists the current released version of each object; older versioned files remain in Git history and under entries. A later website compiler can select a tagged, exact release.

## Rights

Original glossary prose is dedicated to the public domain under [CC0 1.0](LICENSE). Public entries do not include citations, reference lists, source URLs, locators, or source attributions. The private publication store retains the evidence and claim-to-source links. Any generator or validator code in this repository is under [Apache-2.0](LICENSE-CODE). Do not upload source PDFs, copied standard passages, private review records, local paths, credentials, or confidential material.

## Structure

- catalog.json: current released object pointers.
- entries/<headword>/<scope>/<revision-id>.json: machine-readable, immutable release version.
- entries/<headword>/<scope>/<revision-id>.md: reader-facing rendering of that version.
- schemas/: public data contracts.
- scripts/validate.mjs: checks public catalog and entry consistency.

Run node scripts/validate.mjs before proposing a release. A public object records its stable ID, revision ID, bounded scope, original reader text, license scope, and actual review labels. Publication on GitHub is verified against the private release manifest and merged Git commit. No independent external review is implied by owner or internal validation.

The catalog is the authority for which objects are currently released. Drafts and pending review objects remain in the private publication store.
