Pulse 1.0.0 with Next.js Demo
===============================

Full-stack demonstration of Pulse deterministic runtime integrated with Next.js.
This demo proves end-to-end determinism: same inputs produce same outputs with identical hash across 100 runs.

Requirements
------------
Node.js 18 or 20 (check with: node -v)

Installation and Verification
------------------------------

1. Check Node version:
   node -v

2. Install dependencies:
   npm ci

3. Verify compilation (checks that counter.mjs exists):
   npm run compile

4. Verify determinism (100 runs × 2, must produce identical hash):
   npm run verify:determinism

5. Start Next.js dev server:
   npm run dev

6. Test counter API (in another terminal):
   curl http://localhost:3000/api/pulse/counter

   Expected JSON:
   {"ok":true,"sample":"1,2,3,4,5"}

7. Test determinism API (50 runs):
   curl "http://localhost:3000/api/pulse/determinism?runs=50"

   Expected JSON format:
   {"ok":true,"runs":50,"sample":"1,2,3,4,5","mismatchCount":0,"hash":"..."}

   The hash must be stable across multiple curls.

8. Open browser to http://localhost:3000/pulse and click "Run 50× Determinism Test"
   The hash should never change between button clicks.

Expected Hash
-------------
See src/pulse/expected-hash.txt for the verified deterministic hash.
The hash is: 8ba816a17a1c83950b28fd02c267f91045574a84b547ac2e694c9f495354967e

Notes
-----
- counter.mjs is hand-written ESM because Pulse parser does not yet fully support spawn syntax.
- This demonstrates the deterministic runtime with channels and FIFO ordering.
- No setImmediate, setTimeout, or Promise.race used in runtime.
- All operations are deterministic: 100/100 runs produce identical output.

Troubleshooting
---------------
If npm run dev fails:
- Check that Node version is 18 or 20
- Run: rm -rf node_modules package-lock.json && npm install
- Check that port 3000 is not in use

If determinism test fails:
- Check src/pulse/expected-hash.txt exists
- Run: npm run verify:determinism
- All 100 runs must produce the same hash

Security Check
--------------
Verify no prohibited APIs in Pulse runtime:
cd ../..
grep -r "setImmediate\|setTimeout\|Promise.race" lib/runtime/scheduler-deterministic.js lib/runtime/select-deterministic.js

Should only find these terms in comments, not in actual orchestration code.
