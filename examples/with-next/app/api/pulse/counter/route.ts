import { runOnce } from '../../../../src/pulse/counter.mjs';

export async function GET() {
  const sample = await runOnce();
  return Response.json({
    ok: true,
    sample
  });
}
