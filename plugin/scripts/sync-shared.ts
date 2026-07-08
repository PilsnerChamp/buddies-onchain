/**
 * Regenerate the vendored `plugin/src/*` copies of `shared/*`.
 *
 * Usage: bun run sync-shared   (also runs automatically as part of `bun run build`)
 *
 * WHY THIS EXISTS
 * The published plugin ships everything under `plugin/` wholesale into installer
 * caches (audit transparency — an installer can read the exact source that
 * `dist/index.js` bundles). But the `~shared/*` tsconfig alias only resolves
 * in-repo, so a cache with no `shared/` cannot import it. Therefore the shipped
 * `plugin/src/` must be SELF-CONTAINED: the handful of primitives the plugin
 * shares with the site are vendored (copied) in.
 *
 * `shared/` is the SINGLE SOURCE OF TRUTH. These plugin copies are generated
 * mirrors — never hand-edit them. Edit `shared/<x>.ts`, then `bun run build`
 * (or `bun run sync-shared`) regenerates the copies. Drift is caught two ways:
 *   - `plugin/test/vendored-shared-parity.test.ts` fails if a copy diverges,
 *   - `just plugin-check-dist` git-diffs the generated files after a fresh build.
 *
 * The script is deterministic: no randomness, no timestamps. Same inputs ->
 * byte-identical outputs, so the check-dist gate is stable.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Basenames vendored from `shared/` into `plugin/src/`. Keep in sync with the
// imports in `plugin/src/*` and the parity test. Adding a new vendored module?
// Add it here, import it locally in src, and cover it in the parity test.
const VENDORED = [
  'isValidUuid.ts',
  'assertCanonicalV4Uuid.ts',
  'computeIdentityHash.ts',
  'providerBytes16.ts',
  'buddyNftAbi.ts',
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(scriptDir, '..');
const sharedDir = join(pluginRoot, '..', 'shared');
const srcDir = join(pluginRoot, 'src');

function vendoredHeader(basename: string): string {
  return [
    `// plugin/src/${basename}`,
    '//',
    '// GENERATED FILE — DO NOT EDIT DIRECTLY.',
    `// Vendored copy of \`shared/${basename}\`, produced by \`bun run sync-shared\``,
    '// (wired into `bun run build`). `shared/` is the source of truth; the site',
    '// imports it directly, the mainnet-only plugin ships this self-contained copy.',
    `// Edit \`shared/${basename}\` and re-run \`bun run sync-shared\` — never hand-edit`,
    '// this file. Drift is caught by `plugin/test/vendored-shared-parity.test.ts`',
    '// and `just plugin-check-dist`.',
    '//',
    '// Original doc comments from the shared source follow verbatim.',
    '',
  ].join('\n');
}

// Strip only the shared source's leading `// shared/<basename>` path banner so
// it does not collide with the generated `// plugin/src/<basename>` banner. All
// other lines (doc comments + code) are carried verbatim.
function stripSharedPathBanner(source: string, basename: string): string {
  const lines = source.split('\n');
  if (lines[0]?.trim() === `// shared/${basename}`) {
    lines.shift();
    if (lines[0]?.trim() === '//') lines.shift();
  }
  return lines.join('\n');
}

let changed = 0;
for (const basename of VENDORED) {
  const sharedPath = join(sharedDir, basename);
  const srcPath = join(srcDir, basename);

  const shared = readFileSync(sharedPath, 'utf8');
  const body = stripSharedPathBanner(shared, basename);
  const next = `${vendoredHeader(basename)}\n${body}`;

  const current = (() => {
    try {
      return readFileSync(srcPath, 'utf8');
    } catch {
      return null;
    }
  })();

  if (current !== next) {
    writeFileSync(srcPath, next);
    changed += 1;
    console.error(`sync-shared: wrote plugin/src/${basename}`);
  }
}

console.error(
  changed === 0
    ? 'sync-shared: clean (all vendored copies already in sync).'
    : `sync-shared: synced ${changed} file(s) from shared/.`,
);
