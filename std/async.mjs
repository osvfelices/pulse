import { Channel, select, sleep as runtimeSleep, parallel as runtimeParallel, race as runtimeRace, timeout as runtimeTimeout, retry as runtimeRetry, defer as runtimeDefer } from '../lib/runtime/async/index.js';
const print = console.log;
async function sleep(ms) {
  (await runtimeSleep(ms));
}
async function parallel(tasks, options) {
  const opts = (options || {});
  return (await runtimeParallel(tasks, opts));
}
async function race(tasks) {
  return (await runtimeRace(tasks));
}
async function timeout(task, ms) {
  return (await runtimeTimeout(task, ms));
}
async function retry(task, options) {
  const opts = (options || {});
  return (await runtimeRetry(task, opts));
}
function defer(cleanup) {
  runtimeDefer(cleanup);
}
function channel(bufferSize) {
  const size = (bufferSize || 0);
  return new Channel(size);
}
async function selectCases(cases) {
  return (await select(cases));
}
function debounce(fn_input, delay) {
  let timeoutId = null;
  let lastArgs = [];
  const debouncedFn = function (arg1, arg2, arg3) {
  (lastArgs = [arg1, arg2, arg3]);
  if (timeoutId) {
  clearTimeout(timeoutId);
}
  (timeoutId = setTimeout(function () {
  if ((lastArgs.length == 1)) {
  fn_input(lastArgs[0]);
} else if ((lastArgs.length == 2)) {
  fn_input(lastArgs[0], lastArgs[1]);
} else if ((lastArgs.length == 3)) {
  fn_input(lastArgs[0], lastArgs[1], lastArgs[2]);
} else {
  fn_input();
}
  (timeoutId = null);
}, delay));
};
  return debouncedFn;
}
function throttle(fn_input, interval) {
  let lastCall = 0;
  let throttling = false;
  const throttledFn = function (arg1, arg2, arg3) {
  const now = Date.now();
  if (throttling) {
  return;
}
  if (((now - lastCall) >= interval)) {
  if ((arg3 != null)) {
  fn_input(arg1, arg2, arg3);
} else if ((arg2 != null)) {
  fn_input(arg1, arg2);
} else if ((arg1 != null)) {
  fn_input(arg1);
} else {
  fn_input();
}
  (lastCall = now);
} else {
  (throttling = true);
  const remaining = (interval - (now - lastCall));
  setTimeout(function () {
  if ((arg3 != null)) {
  fn_input(arg1, arg2, arg3);
} else if ((arg2 != null)) {
  fn_input(arg1, arg2);
} else if ((arg1 != null)) {
  fn_input(arg1);
} else {
  fn_input();
}
  (lastCall = Date.now());
  (throttling = false);
}, remaining);
}
};
  return throttledFn;
}
function delay(ms, value) {
  return new Promise(function (resolve) {
  setTimeout(function () {
  if (((value != null) && (value != undefined))) {
  resolve(value);
} else {
  resolve(null);
}
}, ms);
});
}
async function waitUntil(condition, options) {
  const opts = (options || {});
  const timeoutMs = (opts.timeout || 5000);
  const intervalMs = (opts.interval || 100);
  const startTime = Date.now();
  while (true) {
  if (condition()) {
  return true;
}
  if (((Date.now() - startTime) > timeoutMs)) {
  throw "waitUntil timeout exceeded";
}
  (await sleep(intervalMs));
}
}
async function sequence(tasks) {
  const results = [];
  for (let i = 0; (i < tasks.length); (i = (i + 1))) {
  const result = (await tasks[i]());
  results.push(result);
}
  return results;
}
function promisify(fn_input) {
  return function (arg1, arg2, arg3) {
  return new Promise(function (resolve, reject) {
  const callback = function (err, result) {
  if (err) {
  reject(err);
} else {
  resolve(result);
}
};
  if ((arg3 != null)) {
  fn_input(arg1, arg2, arg3, callback);
} else if ((arg2 != null)) {
  fn_input(arg1, arg2, callback);
} else if ((arg1 != null)) {
  fn_input(arg1, callback);
} else {
  fn_input(callback);
}
});
};
}
export default {sleep: sleep, parallel: parallel, race: race, timeout: timeout, retry: retry, defer: defer, channel: channel, select: selectCases, debounce: debounce, throttle: throttle, delay: delay, waitUntil: waitUntil, sequence: sequence, promisify: promisify};
