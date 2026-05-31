const fc = require('fast-check');
const { buildPageMap, detectConflicts } = require('../controllers/costController');

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

describe('Conflict Detection - Property Tests', () => {
  test('Property 7: Conflict detection is consistent with page map', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }).chain(totalPages =>
          validRanges(totalPages).map(ranges => ({ ranges, totalPages }))
        ),
        ({ ranges, totalPages }) => {
          const pageMap = buildPageMap(ranges, totalPages);
          const conflicts = detectConflicts(ranges, totalPages);

          // Pages with hasConflict in pageMap should appear in conflicts
          const conflictPages = new Set(conflicts.map(c => c.page));

          for (let p = 1; p <= totalPages; p++) {
            const entry = pageMap[p - 1];
            if (entry.hasConflict) {
              expect(conflictPages.has(p)).toBe(true);
            } else {
              expect(conflictPages.has(p)).toBe(false);
            }
          }

          // Each conflict entry should include all range indices covering that page
          for (const conflict of conflicts) {
            const coveringIndices = [];
            for (let i = 0; i < ranges.length; i++) {
              if (conflict.page >= ranges[i].from && conflict.page <= ranges[i].to) {
                coveringIndices.push(i);
              }
            }
            expect(conflict.ranges).toEqual(coveringIndices);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  test('Property 8: Conflicts are sorted by page number', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }).chain(totalPages =>
          validRanges(totalPages).map(ranges => ({ ranges, totalPages }))
        ),
        ({ ranges, totalPages }) => {
          const conflicts = detectConflicts(ranges, totalPages);

          for (let i = 1; i < conflicts.length; i++) {
            expect(conflicts[i].page).toBeGreaterThan(conflicts[i - 1].page);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  test('Property 9: Non-overlapping ranges produce no conflicts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 200 }).chain(totalPages => {
          // Generate non-overlapping ranges by partitioning the page space
          return fc.integer({ min: 1, max: Math.min(5, totalPages) }).chain(numRanges => {
            const segmentSize = Math.floor(totalPages / numRanges);
            if (segmentSize < 1) return fc.constant({ ranges: [], totalPages });

            const ranges = [];
            for (let i = 0; i < numRanges; i++) {
              const from = i * segmentSize + 1;
              const to = (i === numRanges - 1) ? totalPages : (i + 1) * segmentSize;
              if (from <= to && from >= 1 && to <= totalPages) {
                ranges.push({ from, to, colorType: 'bw', side: 'single' });
              }
            }
            return fc.constant({ ranges, totalPages });
          });
        }),
        ({ ranges, totalPages }) => {
          const conflicts = detectConflicts(ranges, totalPages);
          expect(conflicts).toHaveLength(0);
        }
      ),
      { numRuns: 200 }
    );
  });
});
