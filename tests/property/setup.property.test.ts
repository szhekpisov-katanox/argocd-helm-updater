/**
 * Basic property test to verify fast-check is set up correctly
 */

import * as fc from 'fast-check';

describe('Property Testing Setup', () => {
  it('should support fast-check property tests', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        // Commutative property of addition
        return a + b === b + a;
      }),
      { numRuns: 10 }
    );
  });

  it('should support custom generators', () => {
    const arbPositiveInt = fc.integer({ min: 1, max: 1000 });

    fc.assert(
      fc.property(arbPositiveInt, (n) => {
        return n > 0;
      }),
      { numRuns: 10 }
    );
  });
});
