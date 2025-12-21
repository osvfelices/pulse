// Complex program combining multiple constructs
import { spawn, sleep, Channel } from 'pulselang/runtime'

export async fn worker(ch) {
  for await (const msg of ch) {
    if (msg == null) break

    try {
      const result = await process(msg)
      await ch.send(result)
    } catch (e) {
      console.log("Error:", e)
    }
  }
}

export class TaskPool {
  constructor(size) {
    this.workers = []
    for (let i = 0; i < size; i++) {
      this.workers.push(spawn () => worker(new Channel(10)))
    }
  }
}

const pool = new TaskPool(4)
