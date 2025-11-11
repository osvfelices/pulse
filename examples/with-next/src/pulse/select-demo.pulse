import { DeterministicScheduler, channel, select, selectCase } from '../../../../lib/runtime/index.js'
import { createHash } from 'crypto'

async fn runOnce() {
  const scheduler = new DeterministicScheduler()
  const results = []
  const ch1 = channel(1)
  const ch2 = channel(1)
  const ch3 = channel(1)

  // Producer 1: sends to ch1 at 5ms
  scheduler.spawn(async () => {
    await scheduler.sleep(5)
    await ch1.send('from-ch1')
  })

  // Producer 2: sends to ch2 at 10ms
  scheduler.spawn(async () => {
    await scheduler.sleep(10)
    await ch2.send('from-ch2')
  })

  // Producer 3: sends to ch3 at 15ms
  scheduler.spawn(async () => {
    await scheduler.sleep(15)
    await ch3.send('from-ch3')
  })

  // Consumer uses select - deterministic order by wake time
  scheduler.spawn(async () => {
    const result1 = await select {
      case recv ch1
      case recv ch2
      case recv ch3
    }
    results.push('select1-case' + result1.caseIndex + '-' + result1.value)

    const result2 = await select {
      case recv ch1
      case recv ch2
      case recv ch3
    }
    results.push('select2-case' + result2.caseIndex + '-' + result2.value)

    const result3 = await select {
      case recv ch1
      case recv ch2
      case recv ch3
    }
    results.push('select3-case' + result3.caseIndex + '-' + result3.value)
  })

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
  return {runs: n, sample: firstRun, mismatchCount: mismatchCount, hash: hash}
}

export { runOnce, runMany }
