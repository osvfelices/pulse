/**
 * P0-CORE-10: Parent completes before children, leaving stale parent references
 *
 * Scenario: Parent task spawns children, then completes before children finish.
 * Parent is removed from allTasks, but children still reference it.
 *
 * Bug: child.parent points to deleted task, child.parent.children is stale
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';

async function test_parent_completes_before_children() {
  console.log('\nP0-CORE-10: Parent completes before children');

  const scheduler = new SchedulerCore();

  let parentTask = null;
  let childTask = null;

  parentTask = scheduler.spawn(async () => {
    // Spawn child that takes longer
    childTask = scheduler.spawn(async () => {
      await scheduler.sleep(100);
      return 'child-done';
    });

    // Parent completes immediately
    return 'parent-done';
  });

  // Run until parent completes
  while (parentTask.state !== 'completed' && scheduler.hasWork()) {
    scheduler.step();
    await scheduler.flush();
  }

  console.log(`  Parent state: ${parentTask.state}`);
  console.log(`  Parent in allTasks: ${scheduler.allTasks.has(parentTask.id)}`);
  console.log(`  Child state: ${childTask.state}`);
  console.log(`  Child in allTasks: ${scheduler.allTasks.has(childTask.id)}`);
  console.log(`  Child.parent: ${childTask.parent}`);
  console.log(`  Parent.children.size: ${parentTask.children.size}`);

  // After P0-CORE-10 fix:
  // - child.parent should be null (orphaned)
  // - parent.children should be empty
  if (childTask.parent === null && parentTask.children.size === 0) {
    console.log('  PASS: Parent/child properly detached');
  } else {
    if (childTask.parent !== null) {
      console.log('  ERROR: Child still references parent!');
    }
    if (parentTask.children.size > 0) {
      console.log(`  ERROR: Parent still has ${parentTask.children.size} children!`);
    }
  }
}

await test_parent_completes_before_children();
