const fc = require('fast-check');
const { calculateCost, PRICES } = require('../controllers/costController');

// Arbitrary for valid print settings
const validPrintSettings = () =>
  fc.record({
    mode: fc.constantFrom('whole', 'page-range'),
    colorType: fc.constantFrom('color', 'bw'),
    side: fc.constantFrom('single', 'double'),
    copies: fc.integer({ min: 1, max: 100 }),
    totalPages: fc.integer({ min: 1, max: 500 }),
    binding: fc.constantFrom('none', 'spiral', 'stapling', 'lamination'),
    priority: fc.constantFrom('normal', 'urgent')
  }).chain(settings => {
    if (settings.mode === 'whole') {
      return fc.constant({ ...settings, pageRanges: [] });
    }
    // Generate valid page ranges for page-range mode
    return fc.array(
      fc.integer({ min: 1, max: settings.totalPages }).chain(from =>
        fc.integer({ min: from, max: settings.totalPages }).chain(to =>
          fc.record({
            from: fc.constant(from),
            to: fc.constant(to),
            colorType: fc.constantFrom('color', 'bw'),
            side: fc.constantFrom('single', 'double')
          })
        )
      ),
      { minLength: 1, maxLength: 5 }
    ).map(pageRanges => ({ ...settings, pageRanges }));
  });

describe('Cost Calculation - Property Tests', () => {
  test('Property 1: Cost total is always the sum of its components', () => {
    fc.assert(
      fc.property(validPrintSettings(), (settings) => {
        const result = calculateCost(settings);
        const expectedTotal =
          result.colorPagesCost +
          result.bwPagesCost +
          result.doubleSideCost +
          result.bindingCost +
          result.urgentSurcharge;
        expect(result.total).toBe(expectedTotal);
      }),
      { numRuns: 200 }
    );
  });

  test('Property 2: All pages are accounted for in cost calculation', () => {
    fc.assert(
      fc.property(validPrintSettings(), (settings) => {
        const result = calculateCost(settings);
        expect(result.colorPages + result.bwPages).toBe(settings.totalPages);
      }),
      { numRuns: 200 }
    );
  });

  test('Property 3: Cost is always non-negative', () => {
    fc.assert(
      fc.property(validPrintSettings(), (settings) => {
        const result = calculateCost(settings);
        expect(result.colorPagesCost).toBeGreaterThanOrEqual(0);
        expect(result.bwPagesCost).toBeGreaterThanOrEqual(0);
        expect(result.doubleSideCost).toBeGreaterThanOrEqual(0);
        expect(result.bindingCost).toBeGreaterThanOrEqual(0);
        expect(result.urgentSurcharge).toBeGreaterThanOrEqual(0);
        expect(result.total).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 200 }
    );
  });

  test('Property 4: Double-side cost only applies to double-sided pages', () => {
    fc.assert(
      fc.property(validPrintSettings(), (settings) => {
        const result = calculateCost(settings);

        if (settings.mode === 'whole' && settings.side !== 'double') {
          expect(result.doubleSideCost).toBe(0);
        }

        if (settings.mode === 'page-range') {
          const hasDoubleSided = (settings.pageRanges || []).some(r => r.side === 'double');
          if (!hasDoubleSided) {
            expect(result.doubleSideCost).toBe(0);
          }
        }
      }),
      { numRuns: 200 }
    );
  });
});
