/**
 * Math Module Tests
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as math from '../../lib/std/math.js';

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

  describe('randomInt', () => {
    it('should generate integers in range', () => {
      for (let i = 0; i < 10; i++) {
        const value = math.randomInt(0, 10);
        assert.ok(value >= 0);
        assert.ok(value < 10);
        assert.equal(Math.floor(value), value);
      }
    });

    it('should handle different ranges', () => {
      for (let i = 0; i < 10; i++) {
        const value = math.randomInt(5, 15);
        assert.ok(value >= 5);
        assert.ok(value < 15);
      }
    });

    it('should handle negative ranges', () => {
      for (let i = 0; i < 10; i++) {
        const value = math.randomInt(-10, 0);
        assert.ok(value >= -10);
        assert.ok(value < 0);
      }
    });
  });

  describe('random', () => {
    it('should generate values between 0 and 1', () => {
      for (let i = 0; i < 10; i++) {
        const value = math.random();
        assert.ok(value >= 0);
        assert.ok(value < 1);
      }
    });
  });
});
