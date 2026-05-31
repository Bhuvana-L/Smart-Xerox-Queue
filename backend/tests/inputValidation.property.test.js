const fc = require('fast-check');

/**
 * Property tests for input validation.
 * Tests the validation logic by simulating the middleware behavior.
 */

// Replicate the validation logic for testing without Express req/res
function validatePrintSettings(printSettings) {
  if (!printSettings) {
    return { valid: false, field: 'printSettings', error: 'printSettings is required' };
  }

  const { totalPages, copies, mode, binding, priority, paperSize, orientation, pageRanges } = printSettings;

  // Validate totalPages
  if (totalPages === undefined || totalPages === null) {
    return { valid: false, field: 'totalPages', error: 'totalPages is required' };
  }
  if (!Number.isInteger(totalPages) || typeof totalPages !== 'number') {
    return { valid: false, field: 'totalPages', error: 'totalPages must be an integer' };
  }
  if (totalPages < 1 || totalPages > 10000) {
    return { valid: false, field: 'totalPages', error: 'totalPages must be between 1 and 10000' };
  }

  // Validate copies
  if (copies === undefined || copies === null) {
    return { valid: false, field: 'copies', error: 'copies is required' };
  }
  if (!Number.isInteger(copies) || typeof copies !== 'number') {
    return { valid: false, field: 'copies', error: 'copies must be an integer' };
  }
  if (copies < 1 || copies > 100) {
    return { valid: false, field: 'copies', error: 'copies must be between 1 and 100' };
  }

  // Validate mode
  if (mode && !['whole', 'page-range'].includes(mode)) {
    return { valid: false, field: 'mode', error: 'invalid mode' };
  }

  // Validate page ranges
  if (mode === 'page-range') {
    if (!pageRanges || !Array.isArray(pageRanges) || pageRanges.length === 0) {
      return { valid: false, field: 'pageRanges', error: 'pageRanges required for page-range mode' };
    }

    for (let i = 0; i < pageRanges.length; i++) {
      const { from, to } = pageRanges[i];
      if (!Number.isInteger(from) || from < 1) {
        return { valid: false, field: `pageRanges[${i}].from`, error: 'from must be >= 1' };
      }
      if (!Number.isInteger(to) || to < from) {
        return { valid: false, field: `pageRanges[${i}].to`, error: 'to must be >= from' };
      }
      if (from > totalPages || to > totalPages) {
        return { valid: false, field: `pageRanges[${i}]`, error: 'range exceeds totalPages' };
      }
    }
  }

  return { valid: true };
}

describe('Input Validation - Property Tests', () => {
  test('Property 16: Invalid page ranges are always rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 10 }),
        (totalPages, numRanges) => {
          // Generate invalid ranges: from > to
          const invalidRanges = [];
          for (let i = 0; i < numRanges; i++) {
            invalidRanges.push({
              from: totalPages + 1, // exceeds totalPages
              to: totalPages + 5,
              colorType: 'bw',
              side: 'single'
            });
          }

          const result = validatePrintSettings({
            totalPages,
            copies: 1,
            mode: 'page-range',
            pageRanges: invalidRanges
          });

          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  test('Invalid from > to is rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 500 }),
        (totalPages) => {
          const result = validatePrintSettings({
            totalPages,
            copies: 1,
            mode: 'page-range',
            pageRanges: [{ from: 5, to: 3, colorType: 'bw', side: 'single' }]
          });
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Invalid from < 1 is rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        (totalPages) => {
          const result = validatePrintSettings({
            totalPages,
            copies: 1,
            mode: 'page-range',
            pageRanges: [{ from: 0, to: 5, colorType: 'bw', side: 'single' }]
          });
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Valid page ranges are accepted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }).chain(totalPages =>
          fc.array(
            fc.integer({ min: 1, max: totalPages }).chain(from =>
              fc.integer({ min: from, max: totalPages }).map(to => ({
                from, to, colorType: 'bw', side: 'single'
              }))
            ),
            { minLength: 1, maxLength: 5 }
          ).map(pageRanges => ({ totalPages, pageRanges }))
        ),
        ({ totalPages, pageRanges }) => {
          const result = validatePrintSettings({
            totalPages,
            copies: 1,
            mode: 'page-range',
            pageRanges
          });
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  test('totalPages out of range is rejected', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -1000, max: 0 }),
          fc.integer({ min: 10001, max: 100000 })
        ),
        (totalPages) => {
          const result = validatePrintSettings({
            totalPages,
            copies: 1,
            mode: 'whole'
          });
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('copies out of range is rejected', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -100, max: 0 }),
          fc.integer({ min: 101, max: 1000 })
        ),
        (copies) => {
          const result = validatePrintSettings({
            totalPages: 10,
            copies,
            mode: 'whole'
          });
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
