import { runMany } from '../../../../src/pulse/buffered-simple.mjs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runsParam = searchParams.get('runs');
  const runs = runsParam ? parseInt(runsParam, 10) : 10;

  if (isNaN(runs) || runs < 1 || runs > 1000) {
    return Response.json({ ok: false, error: 'Invalid runs parameter (1-1000)' }, { status: 400 });
  }

  const result = await runMany(runs);

  return Response.json({
    ok: true,
    flow: 'buffered-simple',
    runs: result.runs,
    sample: result.sample,
    mismatchCount: result.mismatchCount,
    hash: result.hash
  });
}
