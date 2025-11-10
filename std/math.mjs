const print = console.log;
const PI = 3.141592653589793;
const E = 2.718281828459045;
const SQRT2 = 1.4142135623730951;
function abs(x) {
  if ((x < 0)) {
  return (-x);
}
  return x;
}
function min(a, b) {
  if ((a < b)) {
  return a;
}
  return b;
}
function max(a, b) {
  if ((a > b)) {
  return a;
}
  return b;
}
function floor(x) {
  return Math.floor(x);
}
function ceil(x) {
  return Math.ceil(x);
}
function round(x) {
  return Math.round(x);
}
function pow(base, exponent) {
  return Math.pow(base, exponent);
}
function sqrt(x) {
  return Math.sqrt(x);
}
function random() {
  return Math.random();
}
function randomInt(min_val, max_val) {
  const range = ((max_val - min_val) + 1);
  return (floor((random() * range)) + min_val);
}
function clamp(value, min_val, max_val) {
  if ((value < min_val)) {
  return min_val;
}
  if ((value > max_val)) {
  return max_val;
}
  return value;
}
function lerp(start, end, t) {
  return (start + ((end - start) * t));
}
function sin(x) {
  return Math.sin(x);
}
function cos(x) {
  return Math.cos(x);
}
function tan(x) {
  return Math.tan(x);
}
function toRadians(degrees) {
  return ((degrees * PI) / 180);
}
function toDegrees(radians) {
  return ((radians * 180) / PI);
}
export default {PI: PI, E: E, SQRT2: SQRT2, abs: abs, min: min, max: max, floor: floor, ceil: ceil, round: round, pow: pow, sqrt: sqrt, random: random, randomInt: randomInt, clamp: clamp, lerp: lerp, sin: sin, cos: cos, tan: tan, toRadians: toRadians, toDegrees: toDegrees};
