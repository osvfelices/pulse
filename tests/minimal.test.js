import { signal, effect } from '../lib/runtime/reactivity.js';

console.log('Creating signal...');
const [value, setValue] = signal(10);

console.log('Creating effect...');
let runs = 0;
let observed = null;

effect(() => {
  runs++;
  observed = value();
  if (runs > 10) {
    console.error('INFINITE LOOP DETECTED - runs:', runs);
    process.exit(1);
  }
});

console.log('Initial runs:', runs, 'observed:', observed);

console.log('Calling setValue(20)...');
setValue(20);

console.log('After setValue runs:', runs, 'observed:', observed);

if (runs === 2) {
  console.log('[OK] PASS - effect ran exactly twice (initial + update)');
} else {
  console.error('[ERROR] FAIL - expected 2 runs, got:', runs);
  process.exit(1);
}
