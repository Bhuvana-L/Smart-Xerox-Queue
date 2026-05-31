const PRICES = {
  bw: 2,
  color: 10,
  doubleSide: 1.5,
  binding: { none: 0, softbinding: 15, spiral: 30, stapling: 5, lamination: 20 },
  urgent: 20
};

/**
 * Get current pricing from database, falling back to defaults.
 */
async function getDynamicPrices() {
  try {
    const Pricing = require('../models/Pricing');
    const p = await Pricing.findOne();
    if (p) {
      return {
        bw: p.bw, color: p.color, doubleSide: p.doubleSide,
        binding: { none: 0, softbinding: p.softbinding || 15, spiral: p.spiral, stapling: p.stapling, lamination: p.lamination },
        urgent: p.urgent
      };
    }
  } catch (e) {}
  return PRICES;
}

/**
 * Calculate the total printing cost based on print settings.
 * Supports 'whole' mode (uniform settings) and 'page-range' mode (per-range settings).
 *
 * @param {Object} settings - Print settings
 * @param {string} settings.mode - 'whole' or 'page-range'
 * @param {string} settings.colorType - 'color' or 'bw' (used in whole mode)
 * @param {string} settings.side - 'single' or 'double' (used in whole mode)
 * @param {number} settings.copies - Number of copies (>= 1)
 * @param {number} settings.totalPages - Total pages in document (>= 1)
 * @param {string} settings.binding - 'none', 'spiral', 'stapling', or 'lamination'
 * @param {string} settings.priority - 'normal' or 'urgent'
 * @param {Array} settings.pageRanges - Array of page range objects (used in page-range mode)
 * @returns {Object} CostBreakdown with colorPages, bwPages, colorPagesCost, bwPagesCost, doubleSideCost, bindingCost, urgentSurcharge, total
 */
function calculateCost(settings) {
  const { mode, colorType, side, copies, totalPages, binding, priority, pageRanges } = settings;
  let singleColorPages = 0, singleBwPages = 0, doubleColorPages = 0, doubleBwPages = 0;

  if (mode === 'whole') {
    const isColor = colorType === 'color';
    const isDouble = side === 'double';
    if (isDouble) {
      if (isColor) doubleColorPages = totalPages; else doubleBwPages = totalPages;
    } else {
      if (isColor) singleColorPages = totalPages; else singleBwPages = totalPages;
    }
  } else {
    // Page-range mode: first-write-wins resolution
    const pageMap = new Array(totalPages + 1).fill(null);
    (pageRanges || []).forEach(r => {
      for (let p = r.from; p <= Math.min(r.to, totalPages); p++) {
        if (pageMap[p] === null) pageMap[p] = r;
      }
    });
    for (let p = 1; p <= totalPages; p++) {
      const entry = pageMap[p];
      const isColor = entry && entry.colorType === 'color';
      const isDouble = entry && entry.side === 'double';
      if (isDouble) {
        if (isColor) doubleColorPages++; else doubleBwPages++;
      } else {
        if (isColor) singleColorPages++; else singleBwPages++;
      }
    }
  }

  // Cost per SHEET:
  // Single side: 1 page = 1 sheet at full price
  // Double side: 2 pages = 1 sheet at 1 sheet price
  const singleColorCost = singleColorPages * copies * PRICES.color;
  const singleBwCost = singleBwPages * copies * PRICES.bw;
  const doubleColorSheets = Math.ceil(doubleColorPages / 2);
  const doubleBwSheets = Math.ceil(doubleBwPages / 2);
  const doubleColorCost = doubleColorSheets * copies * PRICES.color;
  const doubleBwCost = doubleBwSheets * copies * PRICES.bw;

  const sheetCost = singleColorCost + singleBwCost + doubleColorCost + doubleBwCost;
  const bindingCost = PRICES.binding[binding] || 0;
  const urgentSurcharge = priority === 'urgent' ? PRICES.urgent : 0;
  const coverSheetCost = 2;
  const total = sheetCost + bindingCost + urgentSurcharge + coverSheetCost;

  const colorPages = singleColorPages + doubleColorPages;
  const bwPages = singleBwPages + doubleBwPages;

  return { colorPages, bwPages, colorPagesCost: singleColorCost + doubleColorCost, bwPagesCost: singleBwCost + doubleBwCost, doubleSideCost: 0, bindingCost, urgentSurcharge, coverSheetCost, total };
}

/**
 * Build a page map array for frontend visualization.
 * Each entry shows the color type, side, conflict status, and label for a page.
 * Uses first-write-wins resolution for overlapping ranges.
 *
 * @param {Array} ranges - Array of page range objects with from, to, colorType, side
 * @param {number} totalPages - Total number of pages in the document
 * @returns {Array} Array of PageMapEntry objects of length totalPages
 */
function buildPageMap(ranges, totalPages) {
  if (!totalPages || totalPages < 1 || !ranges) return [];

  const coverCount = new Array(totalPages + 1).fill(0);
  const firstRange = new Array(totalPages + 1).fill(null);

  // Pass 1: Count coverage and record first range per page
  for (const range of ranges) {
    const upper = Math.min(range.to, totalPages);
    for (let p = range.from; p <= upper; p++) {
      coverCount[p]++;
      if (firstRange[p] === null) firstRange[p] = range;
    }
  }

  // Pass 2: Build page map entries
  const pageMap = [];
  for (let p = 1; p <= totalPages; p++) {
    const hasConflict = coverCount[p] > 1;
    const range = firstRange[p];

    if (hasConflict) {
      pageMap.push({ page: p, colorType: range.colorType, side: range.side, hasConflict: true, label: '!' });
    } else if (range) {
      const label = range.colorType === 'color' ? 'C' : 'B';
      pageMap.push({ page: p, colorType: range.colorType, side: range.side, hasConflict: false, label });
    } else {
      pageMap.push({ page: p, colorType: 'default', side: 'default', hasConflict: false, label: '?' });
    }
  }

  return pageMap;
}

/**
 * Detect pages covered by two or more ranges (conflicts).
 * Returns conflict entries sorted by page number ascending.
 *
 * @param {Array} ranges - Array of page range objects with from, to
 * @param {number} totalPages - Total number of pages (upper bound for clamping)
 * @returns {Array} Array of { page, ranges } objects where ranges is an array of 0-based range indices
 */
function detectConflicts(ranges, totalPages) {
  if (!totalPages || totalPages < 1 || !ranges || ranges.length === 0) return [];

  // For each page, track which range indices cover it
  const pageCoverage = new Array(totalPages + 1).fill(null);

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const upper = Math.min(range.to, totalPages);
    for (let p = range.from; p <= upper; p++) {
      if (pageCoverage[p] === null) {
        pageCoverage[p] = [i];
      } else {
        pageCoverage[p].push(i);
      }
    }
  }

  // Collect pages with 2+ covering ranges, already in ascending page order
  const conflicts = [];
  for (let p = 1; p <= totalPages; p++) {
    if (pageCoverage[p] && pageCoverage[p].length > 1) {
      conflicts.push({ page: p, ranges: pageCoverage[p] });
    }
  }

  return conflicts;
}

module.exports = { calculateCost, buildPageMap, detectConflicts, PRICES, getDynamicPrices };
