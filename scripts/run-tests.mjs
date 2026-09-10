// Bounded file-level parallelism. Node keeps each test file in its own process.
// The two legacy FEA suites compile into the same .tmp-fea directory, so they
// run in a separate serial phase. Keep both phases even after a test failure.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const concurrencyText = process.env.WEBCAD_TEST_CONCURRENCY ?? '2';
if (!/^[123]$/.test(concurrencyText)) {
  console.error('WEBCAD_TEST_CONCURRENCY must be 1, 2, or 3 (default: 2).');
  process.exit(2);
}
const concurrency = Number(concurrencyText);
const sharedOutputFiles = new Set(['fea-faceselect-integration.test.mjs', 'voxelfea-cutcell.test.mjs']);
const files = readdirSync(new URL('../tests/', import.meta.url)).filter(name => name.endsWith('.test.mjs')).sort();
const phases = concurrency === 1
  ? [{ name: 'all tests', files, concurrency: 1 }]
  : [
      { name: 'isolated test files', files: files.filter(name => !sharedOutputFiles.has(name)), concurrency },
      { name: 'shared FEA compiler output', files: files.filter(name => sharedOutputFiles.has(name)), concurrency: 1 },
    ];
const started = performance.now();
let failed = false;
for (const phase of phases) {
  if (!phase.files.length) continue;
  console.log(`\n[webcad-tests] ${phase.name}: ${phase.files.length} files, concurrency ${phase.concurrency}`);
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types', '--import', './tests/register-resolver.mjs',
    `--test-concurrency=${phase.concurrency}`, '--test', ...phase.files.map(name => `tests/${name}`),
  ], { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) console.error(result.error);
  if (result.signal) {
    console.error(`[webcad-tests] interrupted by ${result.signal}`);
    process.exit(1);
  }
  failed ||= result.status !== 0;
}
console.log(`[webcad-tests] ${files.length} files, ${(performance.now() - started).toFixed(0)} ms, ${failed ? 'FAIL' : 'PASS'}`);
process.exitCode = failed ? 1 : 0;
