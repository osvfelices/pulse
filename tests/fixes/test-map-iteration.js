// Test Map modification during iteration

const map = new Map();

// Create 10 entries
for (let i = 0; i < 10; i++) {
  map.set(`key${i}`, { id: `key${i}`, value: i });
}

console.log(`Map size before iteration: ${map.size}`);

const visited = [];

// Iterate and delete during iteration
for (const entry of map.values()) {
  visited.push(entry.id);
  console.log(`  Visiting: ${entry.id}, map.size=${map.size}`);

  // Delete current entry during iteration
  map.delete(entry.id);
}

console.log(`\nVisited: ${visited.length} entries`);
console.log(`Map size after: ${map.size}`);
console.log(`Visited IDs: ${visited.join(', ')}`);

// Test with Map.keys()
console.log('\n--- Test 2: Using Map.keys() ---');
const map2 = new Map();
for (let i = 0; i < 10; i++) {
  map2.set(`key${i}`, i);
}

console.log(`Map size before: ${map2.size}`);
const visited2 = [];

for (const key of map2.keys()) {
  visited2.push(key);
  map2.delete(key);
}

console.log(`Visited: ${visited2.length}/10`);
console.log(`Map size after: ${map2.size}`);
