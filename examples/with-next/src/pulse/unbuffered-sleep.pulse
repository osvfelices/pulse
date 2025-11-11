// Unbuffered Sleep Flow - Unbuffered channels with sleep and rendezvous
import { DeterministicScheduler, channel } from '../../../../lib/runtime/index.js'
import { createHash } from 'crypto'

async fn runOnce() {
  const scheduler = new DeterministicScheduler()
  const results = []
  const ch = channel(0)

  // Producer with sleep delays
  async fn producer() {
    await scheduler.sleep(1)
    await ch.send('A')
    results.push('sent-A')

    await scheduler.sleep(1)
    await ch.send('B')
    results.push('sent-B')

    await scheduler.sleep(1)
    await ch.send('C')
    results.push('sent-C')

    ch.close()
  }

  // Consumer - unbuffered forces rendezvous
  async fn consumer() {
    for await (const val of ch) {
      results.push('recv-' + val)
    }
  }

  scheduler.spawn(producer)
  scheduler.spawn(consumer)

  await scheduler.run()

  return results.join(',')
}

async fn runMany(n) {
  const runs = []
  let mismatchCount = 0
  const firstRun = await runOnce()

  for (let i = 0; i < n; i = i + 1) {
    const result = await runOnce()
    runs.push(result)
    if (result != firstRun) {
      mismatchCount = mismatchCount + 1
    }
  }

  const hashInput = runs.join('\n')
  const hash = createHash('sha256').update(hashInput).digest('hex')

  return {
    runs: n,
    sample: firstRun,
    mismatchCount: mismatchCount,
    hash: hash
  }
}

export { runOnce, runMany }
