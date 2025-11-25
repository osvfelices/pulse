import { RequestScheduler } from '../lib/runtime/scheduler-request.js';
import { Channel } from '../lib/runtime/channel-deterministic.js';

async function test() {
  const scheduler = new RequestScheduler();
  let caught = false;

  await scheduler.runHandler(async () => {
    const ch = new Channel(0);
    console.log(`Channel registered with scheduler: ${!!ch._registeredWithScheduler}`);

    const child = scheduler.spawn(async () => {
      try {
        console.log('Child: about to recv');
        await ch.recv();
        console.log('Child: recv returned');
      } catch (error) {
        console.log(`Child caught: ${error.code}, ${error.message}`);
        if (error.code === 'TASK_CANCELLED') {
          caught = true;
        }
      }
    });

    await scheduler.sleep(20);
    console.log(`Child state before cancel: ${child.state}`);
    child.cancel();
    console.log(`Child cancelled`);

    await scheduler.sleep(50);
    console.log(`Caught: ${caught}`);
  });
}

test().then(() => console.log('Done')).catch(e => console.error(e));
