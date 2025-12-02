# std/math - Mathematical Functions

## Overview

The `std/math` module provides mathematical functions and constants for numerical computation. It wraps JavaScript's `Math` object with a consistent API and includes additional utility functions.

Key features:
- Mathematical constants (π, e, τ)
- Trigonometric functions
- Exponential and logarithmic functions
- Rounding functions
- Min/max and clamping
- Random number generation (nondeterministic)

## Importing

```javascript
import * as math from 'pulselang/std/math';
```

Or import specific functions and constants:

```javascript
import { PI, sin, cos, sqrt, clamp } from 'pulselang/std/math';
```

## Constants

### `PI: number`

The ratio of a circle's circumference to its diameter (π ≈ 3.14159).

**Example:**
```javascript
import { PI } from 'pulselang/std/math';

const circumference = 2 * PI * radius;
```

### `E: number`

Euler's number, the base of natural logarithms (e ≈ 2.71828).

**Example:**
```javascript
import { E, pow } from 'pulselang/std/math';

const growth = pow(E, rate * time);
```

### `TAU: number`

The ratio of a circle's circumference to its radius, equal to 2π (τ ≈ 6.28318).

**Example:**
```javascript
import { TAU } from 'pulselang/std/math';

const radians = (degrees / 360) * TAU;
```

## Function Reference

### Trigonometric Functions

#### `sin(x: number): number`

Sine of x (x in radians).

**Example:**
```javascript
import { sin, PI } from 'pulselang/std/math';

sin(PI / 2);  // 1
sin(0);       // 0
```

#### `cos(x: number): number`

Cosine of x (x in radians).

**Example:**
```javascript
import { cos, PI } from 'pulselang/std/math';

cos(0);      // 1
cos(PI);     // -1
```

#### `tan(x: number): number`

Tangent of x (x in radians).

**Example:**
```javascript
import { tan, PI } from 'pulselang/std/math';

tan(PI / 4);  // ≈ 1
```

#### `asin(x: number): number`

Arc sine of x (result in radians). Returns NaN if x is outside [-1, 1].

**Example:**
```javascript
import { asin, PI } from 'pulselang/std/math';

asin(1);   // PI / 2
asin(0);   // 0
```

#### `acos(x: number): number`

Arc cosine of x (result in radians). Returns NaN if x is outside [-1, 1].

**Example:**
```javascript
import { acos, PI } from 'pulselang/std/math';

acos(1);   // 0
acos(-1);  // PI
```

#### `atan(x: number): number`

Arc tangent of x (result in radians).

**Example:**
```javascript
import { atan, PI } from 'pulselang/std/math';

atan(1);   // PI / 4
atan(0);   // 0
```

#### `atan2(y: number, x: number): number`

Angle in radians between the positive x-axis and the point (x, y).

**Example:**
```javascript
import { atan2, PI } from 'pulselang/std/math';

atan2(1, 1);   // PI / 4
atan2(1, 0);   // PI / 2
atan2(0, -1);  // PI
```

### Exponential and Logarithmic Functions

#### `exp(x: number): number`

e raised to the power of x (e^x).

**Example:**
```javascript
import { exp, E } from 'pulselang/std/math';

exp(1);   // E
exp(0);   // 1
```

#### `log(x: number): number`

Natural logarithm of x (base e).

**Example:**
```javascript
import { log, E } from 'pulselang/std/math';

log(E);   // 1
log(1);   // 0
```

#### `log10(x: number): number`

Base-10 logarithm of x.

**Example:**
```javascript
import { log10 } from 'pulselang/std/math';

log10(100);   // 2
log10(1000);  // 3
```

#### `log2(x: number): number`

Base-2 logarithm of x.

**Example:**
```javascript
import { log2 } from 'pulselang/std/math';

log2(8);   // 3
log2(16);  // 4
```

#### `pow(base: number, exponent: number): number`

Base raised to the exponent power.

**Example:**
```javascript
import { pow } from 'pulselang/std/math';

pow(2, 3);    // 8
pow(10, 2);   // 100
pow(5, 0);    // 1
```

#### `sqrt(x: number): number`

Square root of x.

**Example:**
```javascript
import { sqrt } from 'pulselang/std/math';

sqrt(16);   // 4
sqrt(2);    // ≈ 1.414
sqrt(-1);   // NaN
```

### Rounding Functions

#### `floor(x: number): number`

Round x down to the nearest integer.

**Example:**
```javascript
import { floor } from 'pulselang/std/math';

floor(4.7);   // 4
floor(4.2);   // 4
floor(-4.7);  // -5
```

#### `ceil(x: number): number`

Round x up to the nearest integer.

**Example:**
```javascript
import { ceil } from 'pulselang/std/math';

ceil(4.2);   // 5
ceil(4.7);   // 5
ceil(-4.2);  // -4
```

#### `round(x: number): number`

Round x to the nearest integer (half values round up).

**Example:**
```javascript
import { round } from 'pulselang/std/math';

round(4.5);   // 5
round(4.4);   // 4
round(-4.5);  // -4
```

#### `trunc(x: number): number`

Remove fractional part of x, returning the integer part.

**Example:**
```javascript
import { trunc } from 'pulselang/std/math';

trunc(4.9);   // 4
trunc(4.1);   // 4
trunc(-4.9);  // -4
```

### Aggregation Functions

#### `min(...values: number[]): number`

Return the smallest of the given numbers.

**Example:**
```javascript
import { min } from 'pulselang/std/math';

min(5, 2, 8, 1);  // 1
min(10, 20);      // 10
```

#### `max(...values: number[]): number`

Return the largest of the given numbers.

**Example:**
```javascript
import { max } from 'pulselang/std/math';

max(5, 2, 8, 1);  // 8
max(10, 20);      // 20
```

#### `clamp(value: number, min: number, max: number): number`

Clamp a value between minimum and maximum bounds.

**Parameters:**
- `value` - Value to clamp
- `min` - Minimum allowed value
- `max` - Maximum allowed value

**Returns:** Value constrained to [min, max]

**Example:**
```javascript
import { clamp } from 'pulselang/std/math';

clamp(5, 0, 10);   // 5
clamp(-5, 0, 10);  // 0
clamp(15, 0, 10);  // 10
```

### Random Functions (Nondeterministic)

#### `random(): number`

Generate a random number between 0 (inclusive) and 1 (exclusive).

**WARNING:** This function is nondeterministic.

**Returns:** Random number in [0, 1)

**Example:**
```javascript
import { random } from 'pulselang/std/math';

const r = random();  // e.g., 0.42857...
```

#### `randomInt(min: number, max: number): number`

Generate a random integer between min (inclusive) and max (exclusive).

**WARNING:** This function is nondeterministic.

**Parameters:**
- `min` - Minimum value (inclusive)
- `max` - Maximum value (exclusive)

**Returns:** Random integer in [min, max)

**Example:**
```javascript
import { randomInt } from 'pulselang/std/math';

const diceRoll = randomInt(1, 7);  // 1-6
const coinFlip = randomInt(0, 2);   // 0 or 1
```

## Determinism Guarantees

Most functions in `std/math` are deterministic:

1. **Constants**: `PI`, `E`, and `TAU` are constant values.

2. **Trigonometric Functions**: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2` are deterministic for the same inputs.

3. **Exponential/Logarithmic Functions**: `exp`, `log`, `log10`, `log2`, `pow`, `sqrt` are deterministic.

4. **Rounding Functions**: `floor`, `ceil`, `round`, `trunc` are deterministic.

5. **Aggregation Functions**: `min`, `max`, `clamp` are deterministic.

**Nondeterministic Functions:**
- `random()` - Uses nondeterministic PRNG
- `randomInt()` - Uses nondeterministic PRNG

**Floating-Point Considerations:**
- Floating-point arithmetic may produce slightly different results on different platforms due to rounding
- For most practical purposes, these differences are negligible
- Results are deterministic on the same platform with the same JavaScript engine

## Examples

### Basic Calculations

```javascript
import { sqrt, pow, PI } from 'pulselang/std/math';

function distance(x1, y1, x2, y2) {
  return sqrt(pow(x2 - x1, 2) + pow(y2 - y1, 2));
}

const dist = distance(0, 0, 3, 4);
// Returns: 5

function circleArea(radius) {
  return PI * radius * radius;
}

const area = circleArea(10);
// Returns: ≈ 314.159
```

### Trigonometry

```javascript
import { sin, cos, atan2, PI, TAU } from 'pulselang/std/math';

function degreesToRadians(degrees) {
  return (degrees / 360) * TAU;
}

function radiansToDegrees(radians) {
  return (radians / TAU) * 360;
}

// Calculate angle between two points
function angleBetween(x1, y1, x2, y2) {
  return atan2(y2 - y1, x2 - x1);
}

const angle = angleBetween(0, 0, 1, 1);
// Returns: PI / 4 (45 degrees)
```

### Clamping and Ranges

```javascript
import { clamp, min, max } from 'pulselang/std/math';

function normalizeValue(value, inputMin, inputMax, outputMin, outputMax) {
  const normalized = (value - inputMin) / (inputMax - inputMin);
  const clamped = clamp(normalized, 0, 1);
  return clamped * (outputMax - outputMin) + outputMin;
}

const scaled = normalizeValue(150, 0, 200, 0, 100);
// Returns: 75

function ensureInRange(value, minVal, maxVal) {
  return clamp(value, minVal, maxVal);
}

// Keep value within bounds
const bounded = ensureInRange(temperature, -10, 40);
```

### Rounding and Precision

```javascript
import { floor, ceil, round } from 'pulselang/std/math';

function roundToDecimal(value, decimals) {
  const multiplier = Math.pow(10, decimals);
  return round(value * multiplier) / multiplier;
}

const price = roundToDecimal(19.567, 2);
// Returns: 19.57

function ceilToMultiple(value, multiple) {
  return ceil(value / multiple) * multiple;
}

const pages = ceilToMultiple(47, 10);
// Returns: 50 (round up to nearest 10)
```

### Random Number Generation

```javascript
import { random, randomInt } from 'pulselang/std/math';

function randomChoice(array) {
  const index = randomInt(0, array.length);
  return array[index];
}

const colors = ['red', 'green', 'blue', 'yellow'];
const color = randomChoice(colors);

function randomFloat(min, max) {
  return random() * (max - min) + min;
}

const temperature = randomFloat(20.0, 25.0);
// e.g., 22.43

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const deck = shuffle([1, 2, 3, 4, 5]);
```

### Exponential Growth and Decay

```javascript
import { exp, log, E } from 'pulselang/std/math';

function compoundInterest(principal, rate, time) {
  return principal * exp(rate * time);
}

const investment = compoundInterest(1000, 0.05, 10);
// Returns: ≈ 1648.72

function halfLife(initial, halfLifeTime, elapsed) {
  return initial * exp(-log(2) * elapsed / halfLifeTime);
}

const remaining = halfLife(100, 5, 10);
// Returns: 25 (after 2 half-lives)
```

### Coordinate Transformations

```javascript
import { sin, cos, atan2, sqrt, pow } from 'pulselang/std/math';

function cartesianToPolar(x, y) {
  return {
    r: sqrt(x * x + y * y),
    theta: atan2(y, x)
  };
}

function polarToCartesian(r, theta) {
  return {
    x: r * cos(theta),
    y: r * sin(theta)
  };
}

const polar = cartesianToPolar(3, 4);
// Returns: { r: 5, theta: ≈ 0.927 }

const cartesian = polarToCartesian(5, polar.theta);
// Returns: { x: 3, y: 4 }
```

### Statistical Functions

```javascript
import { sqrt, pow } from 'pulselang/std/math';

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function variance(values) {
  const avg = mean(values);
  return mean(values.map(v => pow(v - avg, 2)));
}

function standardDeviation(values) {
  return sqrt(variance(values));
}

const data = [2, 4, 4, 4, 5, 5, 7, 9];
const avg = mean(data);         // 5
const variance = variance(data); // 4
const stdDev = standardDeviation(data); // 2
```
