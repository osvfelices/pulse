import { runMany } from '../../../../src/pulse/counter.mjs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runsParam = searchParams.get('runs');
  const runs = runsParam ? parseInt(runsParam, 10) : 50;

  if (isNaN(runs) || runs < 1 || runs > 1000) {
    return Response.json({ ok: false, error: 'Invalid runs parameter' }, { status: 400 });
  }

  const result = await runMany(runs);

  return Response.json({
    ok: true,
    runs: result.runs,
    sample: result.sample,
    mismatchCount: result.mismatchCount,
    hash: result.hash
  });
}
