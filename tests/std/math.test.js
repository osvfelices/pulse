/**
 * Math Module Tests
 */

import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import * as math from '../../lib/std/math.js';
import { DeterministicScheduler, resetScheduler, getScheduler } from '../../lib/runtime/scheduler-deterministic.js';

describe('std/math', () => {
  describe('constants', () => {
    it('should export PI', () => {
      assert.equal(math.PI, Math.PI);
    });

    it('should export E', () => {
      assert.equal(math.E, Math.E);
    });

    it('should export TAU', () => {
      assert.equal(math.TAU, 2 * Math.PI);
    });
  });

  describe('trigonometric functions', () => {
    it('should calculate sin', () => {
      assert.equal(math.sin(0), 0);
      assert.equal(math.sin(math.PI / 2), 1);
    });

    it('should calculate cos', () => {
      assert.equal(math.cos(0), 1);
      assert.ok(Math.abs(math.cos(math.PI / 2)) < 1e-10);
    });

    it('should calculate tan', () => {
      assert.equal(math.tan(0), 0);
    });
  });

  describe('exponential and logarithmic functions', () => {
    it('should calculate exp', () => {
      assert.equal(math.exp(0), 1);
      assert.ok(Math.abs(math.exp(1) - math.E) < 1e-10);
    });

    it('should calculate log', () => {
      assert.equal(math.log(1), 0);
      assert.equal(math.log(math.E), 1);
    });

    it('should calculate pow', () => {
      assert.equal(math.pow(2, 3), 8);
      assert.equal(math.pow(5, 2), 25);
    });

    it('should calculate sqrt', () => {
      assert.equal(math.sqrt(4), 2);
      assert.equal(math.sqrt(9), 3);
    });
  });

  describe('rounding functions', () => {
    it('should floor values', () => {
      assert.equal(math.floor(3.7), 3);
      assert.equal(math.floor(-3.2), -4);
    });

    it('should ceil values', () => {
      assert.equal(math.ceil(3.2), 4);
      assert.equal(math.ceil(-3.7), -3);
    });

    it('should round values', () => {
      assert.equal(math.round(3.5), 4);
      assert.equal(math.round(3.4), 3);
    });

    it('should truncate values', () => {
      assert.equal(math.trunc(3.7), 3);
      assert.equal(math.trunc(-3.7), -3);
    });
  });

  describe('aggregation functions', () => {
    it('should find min', () => {
      assert.equal(math.min(1, 2, 3), 1);
      assert.equal(math.min(5, 2, 8, 1), 1);
    });

    it('should find max', () => {
      assert.equal(math.max(1, 2, 3), 3);
      assert.equal(math.max(5, 2, 8, 1), 8);
    });
  });

  describe('clamp', () => {
    it('should clamp value within range', () => {
      assert.equal(math.clamp(5, 0, 10), 5);
    });

    it('should clamp to min', () => {
      assert.equal(math.clamp(-5, 0, 10), 0);
    });

    it('should clamp to max', () => {
      assert.equal(math.clamp(15, 0, 10), 10);
    });

    it('should handle boundary values', () => {
      assert.equal(math.clamp(0, 0, 10), 0);
      assert.equal(math.clamp(10, 0, 10), 10);
    });

    it('should handle negative ranges', () => {
      assert.equal(math.clamp(-5, -10, -1), -5);
      assert.equal(math.clamp(-15, -10, -1), -10);
      assert.equal(math.clamp(0, -10, -1), -1);
    });
  });

  // ============================================================================
  // DETERMINISTIC PRNG TESTS (P0-3 fix + P0-NEW-1 scheduler-local)
  // ============================================================================
  // All PRNG tests now use scheduler context since PRNG state is scheduler-local

  describe('seedRandom', () => {
    beforeEach(() => {
      // Initialize scheduler for each test
      getScheduler();
    });

    it('should require integer seed', () => {
      assert.throws(() => math.seedRandom(3.14), /integer seed/);
      assert.throws(() => math.seedRandom('123'), /integer seed/);
      assert.throws(() => math.seedRandom(null), /integer seed/);
    });

    it('should accept valid integer seeds', () => {
      assert.doesNotThrow(() => math.seedRandom(0));
      assert.doesNotThrow(() => math.seedRandom(12345));
      assert.doesNotThrow(() => math.seedRandom(-1)); // Converted to unsigned
    });
  });

  describe('randomSeeded (deterministic)', () => {
    beforeEach(() => {
      resetScheduler();
      getScheduler(); // Reinitialize scheduler
      math.resetPRNG();
    });

    it('should throw if not seeded', () => {
      assert.throws(() => math.randomSeeded(), /not seeded/);
    });

    it('should generate values between 0 and 1', () => {
      math.seedRandom(42);
      for (let i = 0; i < 10; i++) {
        const value = math.randomSeeded();
        assert.ok(value >= 0, `Value ${value} should be >= 0`);
        assert.ok(value < 1, `Value ${value} should be < 1`);
      }
    });

    it('should produce identical sequence from same seed', () => {
      math.seedRandom(12345);
      const seq1 = [];
      for (let i = 0; i < 10; i++) {
        seq1.push(math.randomSeeded());
      }

      math.seedRandom(12345);
      const seq2 = [];
      for (let i = 0; i < 10; i++) {
        seq2.push(math.randomSeeded());
      }

      assert.deepEqual(seq1, seq2, 'Same seed should produce identical sequence');
    });

    it('should produce different sequences from different seeds', () => {
      math.seedRandom(111);
      const val1 = math.randomSeeded();

      math.seedRandom(222);
      const val2 = math.randomSeeded();

      assert.notEqual(val1, val2, 'Different seeds should produce different values');
    });
  });

  describe('randomIntSeeded (deterministic)', () => {
    beforeEach(() => {
      resetScheduler();
      getScheduler();
      math.resetPRNG();
    });

    it('should throw if not seeded', () => {
      assert.throws(() => math.randomIntSeeded(0, 10), /not seeded/);
    });

    it('should generate integers in range', () => {
      math.seedRandom(42);
      for (let i = 0; i < 100; i++) {
        const value = math.randomIntSeeded(0, 10);
        assert.ok(value >= 0, `Value ${value} should be >= 0`);
        assert.ok(value < 10, `Value ${value} should be < 10`);
        assert.equal(Math.floor(value), value, 'Should be integer');
      }
    });

    it('should handle different ranges', () => {
      math.seedRandom(42);
      for (let i = 0; i < 100; i++) {
        const value = math.randomIntSeeded(5, 15);
        assert.ok(value >= 5);
        assert.ok(value < 15);
      }
    });

    it('should handle negative ranges', () => {
      math.seedRandom(42);
      for (let i = 0; i < 100; i++) {
        const value = math.randomIntSeeded(-10, 0);
        assert.ok(value >= -10);
        assert.ok(value < 0);
      }
    });

    it('should produce identical sequence from same seed', () => {
      math.seedRandom(12345);
      const seq1 = [];
      for (let i = 0; i < 10; i++) {
        seq1.push(math.randomIntSeeded(0, 100));
      }

      math.seedRandom(12345);
      const seq2 = [];
      for (let i = 0; i < 10; i++) {
        seq2.push(math.randomIntSeeded(0, 100));
      }

      assert.deepEqual(seq1, seq2, 'Same seed should produce identical sequence');
    });

    it('should throw for invalid ranges', () => {
      math.seedRandom(42);
      assert.throws(() => math.randomIntSeeded(10, 5), /min < max/);
      assert.throws(() => math.randomIntSeeded(5, 5), /min < max/);
    });

    it('should throw for non-numeric arguments', () => {
      math.seedRandom(42);
      assert.throws(() => math.randomIntSeeded('0', 10), /numeric/);
      assert.throws(() => math.randomIntSeeded(0, '10'), /numeric/);
    });
  });

  describe('PRNG scheduler isolation (P0-NEW-1)', () => {
    it('should have independent state per scheduler', async () => {
      // First scheduler
      resetScheduler();
      const scheduler1 = getScheduler();
      math.seedRandom(42);
      const val1_a = math.randomSeeded();
      const val1_b = math.randomSeeded();

      // Second scheduler (reset creates a new one)
      resetScheduler();
      const scheduler2 = getScheduler();
      math.seedRandom(42);
      const val2_a = math.randomSeeded();
      const val2_b = math.randomSeeded();

      // Same seed should produce same sequence in each scheduler
      assert.equal(val1_a, val2_a, 'Same seed should produce same first value');
      assert.equal(val1_b, val2_b, 'Same seed should produce same second value');
    });
  });

  // ============================================================================
  // DEPRECATED NONDETERMINISTIC FUNCTIONS
  // ============================================================================

  describe('randomInt (deprecated)', () => {
    it('should throw by default (determinism protection)', () => {
      assert.throws(() => math.randomInt(0, 10), /nondeterministic/);
    });
  });

  describe('random (deprecated)', () => {
    it('should throw by default (determinism protection)', () => {
      assert.throws(() => math.random(), /nondeterministic/);
    });
  });
});
