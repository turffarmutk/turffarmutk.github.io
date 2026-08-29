/*
 * Runs the whole test suite, several files at a time instead of one after
 * another.
 *
 * Why this exists: every push runs these checks first, and the crew's app only
 * goes out once they pass. Run end to end, one at a time, they took about three
 * minutes on a laptop. Three minutes is long enough that a push looks frozen —
 * GitHub Desktop shows a spinner and nothing else — and the natural reaction is
 * to quit and restart, which kills the check before it can finish. That is not
 * a hypothetical: it is exactly what happened on 2026-08-29, three times in a
 * row, and no push ever landed.
 *
 * Nothing about the checks themselves changed. Each file is still its own
 * separate run of node, exactly as before; this only starts a few of them at
 * the same time. They are safe to overlap because every one of them only READS
 * the app file — none of them writes anything, so they cannot tread on each
 * other.
 *
 * Output is held and printed in file order, not in the order they happen to
 * finish, so the result reads the same every time and you can compare two runs.
 *
 *   node tools/run-tests.js          — all of them
 *   UT_TEST_JOBS=1 node tools/...    — one at a time, for when output interleaving
 *                                      or memory is getting in the way
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const DIR = __dirname;

/* The list is read off the disk rather than typed out somewhere, so a new
   test file starts running the day it is added. A list kept by hand is a list
   that eventually disagrees with reality, and the failure is silent: the test
   exists, nobody runs it, and everyone assumes it passed. */
const files = fs.readdirSync(DIR)
  .filter(n => /^test-.*\.js$/.test(n))
  .sort();

/* Boot goes first purely so its result is the first thing on screen. It is the
   one that catches the app failing to open at all, which makes every other
   result meaningless, so it is the one worth reading first. */
const first = 'test-boot.js';
if (files.includes(first)) files.splice(files.indexOf(first), 1), files.unshift(first);

/* How many at once. Each file loads the whole 19,500-line app into a fake
   browser and can reach about 1.6 GB on its own, so what limits this is memory,
   not how many processor cores the machine has. Past a point more at once is
   SLOWER, not faster: the machine runs out of real memory and starts shuffling
   it to disk. Measured on the 16 GB laptop this was written on — 4 at a time
   took 72s, 6 took 65s, 8 took 60s but pushed another 600 MB onto disk. The
   extra five seconds were not worth the swapping, so this allows each run about
   2.5 GB of the machine's memory and lands on 6 there. */
const budget = Math.floor((os.totalmem() / 1073741824) / 2.5);
const JOBS = Math.max(1, Math.min(
  Number(process.env.UT_TEST_JOBS) || budget,
  os.cpus().length,
  files.length
));

const started = Date.now();
const results = new Array(files.length);
let next = 0, running = 0, printed = 0;

/* Print everything that is ready, in file order. A file that finishes early
   waits its turn rather than jumping the queue. */
function flush() {
  while (printed < results.length && results[printed]) {
    process.stdout.write(results[printed].out);
    printed++;
  }
}

function launch() {
  while (running < JOBS && next < files.length) {
    const i = next++;
    const name = files[i];
    running++;

    const child = spawn(process.execPath, [path.join(DIR, name)], {
      cwd: path.join(DIR, '..'),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });

    child.on('close', code => {
      results[i] = { name, code, out: '\n===== ' + name + ' =====\n' + out };
      running--;
      flush();
      launch();
      if (running === 0 && next >= files.length) done();
    });
  }
}

function done() {
  flush();

  /* A file that crashed is a failure even if it printed PASS lines before it
     died, so the exit code is taken from the process, never from the words on
     screen. The one exception worth naming out loud is "app script threw":
     that is the app failing to open, and the file it happens in may still
     report PASS for checks that ran before it. */
  const broken = results.filter(r => r.code !== 0);
  const threw = results.filter(r => /app script threw/.test(r.out));

  let pass = 0, fail = 0;
  results.forEach(r => {
    const m = r.out.match(/(\d+) passed, (\d+) failed/);
    if (m) { pass += Number(m[1]); fail += Number(m[2]); }
  });

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(files.length + ' files, ' + JOBS + ' at a time, ' + secs + 's');
  console.log(pass + ' passed, ' + fail + ' failed');

  if (threw.length) {
    console.log('\n  ! THE APP FAILED TO OPEN in: ' + threw.map(r => r.name).join(', '));
    console.log('    Everything below that point in the app never ran. Fix this first.');
  }
  if (broken.length) {
    console.log('\n  ! FAILED: ' + broken.map(r => r.name).join(', '));
  }
  console.log('='.repeat(60));

  process.exit(broken.length || threw.length ? 1 : 0);
}

launch();
