#!/usr/bin/env node
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { doctor } from './doctor.mjs';
import { Expected, exitCode, results, importReport } from './report.mjs';
const args = process.argv.slice(2);
if (args.includes('--help') || !args.length) {
  console.log('trackfast doctor <authorized-url> [--expect any|ga4|posthog|mixpanel] [--json] [--output report.json] [--wait 3000]\ntrackfast doctor --import report.json [--expect vendor] [--json]\ntrackfast gen (run in a Trackfast template with insight.yml and src/lib/analytics.ts)\nObservation only. --test-events explicitly emits one own-template event using TRACKFAST_OPERATOR_TOKEN.\nExit: 0 accepted response; 1 rejected/missing expected vendor; 2 unknown; 3 usage/runtime error.');
} else {
  try {
    if (args[0] === 'gen') { const run = spawnSync(process.execPath, [fileURLToPath(new URL('./gen.cjs', import.meta.url))], { stdio: 'inherit' }); process.exitCode = run.status ?? 3; }
    else {
      if (args.shift() !== 'doctor') throw new Error('Unknown command.');
      let target; const opts = { expected: 'any', wait: 3000 }; let json = false; let output; let imported;
      while (args.length) { const arg = args.shift();
        if (arg === '--expect') opts.expected = Expected.parse(args.shift());
        else if (arg === '--wait') { opts.wait = Number(args.shift()); if (!Number.isInteger(opts.wait) || opts.wait < 500 || opts.wait > 10000) throw new Error('Wait must be 500–10000 milliseconds.'); }
        else if (arg === '--json') json = true;
        else if (arg === '--output') { output = args.shift(); if (!output) throw new Error('Output path required.'); }
        else if (arg === '--import') { imported = args.shift(); if (!imported) throw new Error('Import path required.'); }
        else if (arg === '--test-events') { opts.testEvents = true; opts.token = process.env.TRACKFAST_OPERATOR_TOKEN; }
        else if (!arg.startsWith('-') && !target) target = arg;
        else throw new Error('Unknown argument. Use --help.');
      }
      if (!target && !imported || target && imported) throw new Error('Supply one URL or one import file.');
      let report;
      if (imported) { const raw = await readFile(imported); if (raw.length > 5000000) throw new Error('Report exceeds 5 MB.'); report = importReport(JSON.parse(raw.toString()), opts.expected); }
      else report = await doctor(target, opts);
      const serialized = JSON.stringify(report, null, 2);
      if (output) await writeFile(output, serialized, { flag: 'wx', mode: 0o600 });
      console.log(json ? serialized : results(report).map(r => `${r.vendor.toUpperCase()} ${r.status.toUpperCase()}: ${r.explanation}`).join('\n') + '\nDownstream receipt: UNKNOWN');
      process.exitCode = exitCode(report);
    }
  } catch { console.error('Doctor could not complete. Check arguments, URL access, report format and Puppeteer browser installation. Use --help. No report was certified.'); process.exitCode = 3; }
}
