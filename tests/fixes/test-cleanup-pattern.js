// Test the exact pattern used in scheduler cleanup()

class MockTask {
  constructor(id, scheduler) {
    this.id = Symbol('task');
    this.debugId = id;
    this.state = 'running';
    this.scheduler = scheduler;
  }

  cancel() {
    if (this.state === 'cancelled') return;
    this.state = 'cancelled';
    // This calls removeTask which deletes from allTasks during iteration
    this.scheduler.removeTask(this);
  }
}

class MockScheduler {
  constructor() {
    this.allTasks = new Map();
  }

  addTask(task) {
    this.allTasks.set(task.id, task);
  }

  removeTask(task) {
    // This is called during cleanup iteration!
    this.allTasks.delete(task.id);
    console.log(`    removeTask(${task.debugId}): allTasks.size = ${this.allTasks.size}`);
  }

  cleanup() {
    console.log(`\ncleanup() starting, allTasks.size = ${this.allTasks.size}`);

    // EXACT pattern from scheduler-core.js:746-750
    for (const task of this.allTasks.values()) {
      if (task.state === 'running' || task.state === 'pending' || task.state === 'sleeping') {
        console.log(`  Cancelling task ${task.debugId}`);
        task.cancel(); // This calls removeTask() which modifies allTasks
      }
    }

    console.log(`cleanup() finished, allTasks.size = ${this.allTasks.size}`);
  }
}

// Create scheduler with 10 tasks
const scheduler = new MockScheduler();
const tasks = [];

for (let i = 0; i < 10; i++) {
  const task = new MockTask(i, scheduler);
  tasks.push(task);
  scheduler.addTask(task);
}

console.log('=== Testing cleanup() pattern ===');
console.log(`Created ${tasks.length} tasks`);
console.log(`allTasks.size = ${scheduler.allTasks.size}`);

// Run cleanup - this modifies allTasks during iteration
scheduler.cleanup();

// Verify all tasks were cancelled
const cancelled = tasks.filter(t => t.state === 'cancelled').length;
const notCancelled = tasks.filter(t => t.state !== 'cancelled').length;

console.log(`\n=== Results ===`);
console.log(`Cancelled: ${cancelled}/${tasks.length}`);
console.log(`Not cancelled: ${notCancelled}/${tasks.length}`);
console.log(`allTasks.size after cleanup: ${scheduler.allTasks.size}`);

if (notCancelled === 0 && scheduler.allTasks.size === 0) {
  console.log('\n✓ SAFE: All tasks cancelled, Map iterator handled deletion correctly');
} else {
  console.log('\n✗ BUG: Some tasks not cancelled!');
}
