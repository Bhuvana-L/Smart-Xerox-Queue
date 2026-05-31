const fc = require('fast-check');
const { buildPageMap } = require('../controllers/costController');

// Generate valid page ranges for a given totalPages
const validRanges = (totalPages) =>
  fc.array(
    fc.integer({ min: 1, max: totalPages }).chain(from =>
      fc.integer({ min: from, max: totalPages }).chain(to =>
        fc.record({
          from: fc.constant(from),
          to: fc.constant(to),
          colorType: fc.constantFrom('color', 'bw'),
          side: fc.constantFrom('single', 'double')
        })
      )
    ),
    { minLength: 0, maxLength: 5 }
  );

describe('Page Map Builder - Property Tests', () => {
  test('Property 5: Page map has exactly totalPages entries', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }).chain(totalPages =>
          validRanges(totalPages).map(ranges => ({ ranges, totalPages }))
        ),
        ({ ranges, totalPages }) => {
          const pageMap = buildPageMap(ranges, totalPages);
          expect(pageMap).toHaveLength(totalPages);
          // Each entry has correct 1-indexed page number
          pageMap.forEach((entry, idx) => {
            expect(entry.page).toBe(idx + 1);
          });
        }
      ),
      { numRuns: 200 }
    );
  });

  test('Property 6: Page map labeling is consistent with coverage', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }).chain(totalPages =>
          validRanges(totalPages).map(ranges => ({ ranges, totalPages }))
        ),
        ({ ranges, totalPages }) => {
          const pageMap = buildPageMap(ranges, totalPages);

          // Count coverage per page
          const coverCount = new Array(totalPages + 1).fill(0);
          const firstRange = new Array(totalPages + 1).fill(null);
          for (const range of ranges) {
            for (let p = range.from; p <= Math.min(range.to, totalPages); p++) {
              coverCount[p]++;
              if (firstRange[p] === null) firstRange[p] = range;
            }
          }

          for (let p = 1; p <= totalPages; p++) {
            const entry = pageMap[p - 1];
            if (coverCount[p] === 0) {
              // Uncovered page
              expect(entry.colorType).toBe('default');
              expect(entry.side).toBe('default');
              expect(entry.label).toBe('?');
              expect(entry.hasConflict).toBe(false);
            } else if (coverCount[p] === 1) {
              // Single coverage
              expect(entry.hasConflict).toBe(false);
              const expectedLabel = firstRange[p].colorType === 'color' ? 'C' : 'B';
              expect(entry.label).toBe(expectedLabel);
              expect(entry.colorType).toBe(firstRange[p].colorType);
              expect(entry.side).toBe(firstRange[p].side);
            } else {
              // Multiple coverage (conflict)
              expect(entry.hasConflict).toBe(true);
              expect(entry.label).toBe('!');
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  test('Property 17: First-write-wins resolution for overlapping ranges', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }).chain(totalPages =>
          fc.array(
            fc.integer({ min: 1, max: totalPages }).chain(from =>
              fc.integer({ min: from, max: totalPages }).chain(to =>
                fc.record({
                  from: fc.constant(from),
                  to: fc.constant(to),
                  colorType: fc.constantFrom('color', 'bw'),
                  side: fc.constantFrom('single', 'double')
                })
              )
            ),
            { minLength: 2, maxLength: 5 }
          ).map(ranges => ({ ranges, totalPages }))
        ),
        ({ ranges, totalPages }) => {
          const pageMap = buildPageMap(ranges, totalPages);

          // For pages with conflicts, the colorType and side should match the FIRST range
          for (let p = 1; p <= totalPages; p++) {
            const entry = pageMap[p - 1];
            // Find first range covering this page
            let firstCovering = null;
            for (const range of ranges) {
              if (p >= range.from && p <= range.to) {
                firstCovering = range;
                break;
              }
            }
            if (firstCovering && entry.hasConflict) {
              expect(entry.colorType).toBe(firstCovering.colorType);
              expect(entry.side).toBe(firstCovering.side);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
