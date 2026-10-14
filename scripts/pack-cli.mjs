import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
await build({ entryPoints: ['scripts/gen-schema.ts'], outfile: 'cli/gen.cjs', platform: 'node', format: 'cjs', bundle: true, external: ['js-yaml'] });
copyFileSync('docs/SETUP.md', 'cli/README.md');
const cache = mkdtempSync(`${tmpdir()}/trackfast-pack-`);
try {
  const result = JSON.parse(execFileSync('npm', ['pack', './cli', '--pack-destination', 'public/downloads', '--json', '--cache', cache], { encoding: 'utf8' }));
  const filename = result[0].filename;
  if (filename !== 'trackfast-doctor-0.1.0.tgz') throw new Error('Unexpected archive filename');
  writeFileSync('public/downloads/SETUP.md', readFileSync('docs/SETUP.md'));
  console.log(`Packaged ${filename} (${result[0].size} bytes)`);
} finally { rmSync(cache, { recursive: true, force: true }); }
