/**
 * Server-side input validation middleware for order submission.
 * Validates req.body.printSettings fields before order creation.
 */

const ALLOWED_MODES = ['whole', 'page-range'];
const ALLOWED_BINDINGS = ['none', 'softbinding', 'spiral', 'stapling', 'lamination'];
const ALLOWED_PRIORITIES = ['normal', 'urgent'];
const ALLOWED_PAPER_SIZES = ['A4', 'A3', 'Legal'];
const ALLOWED_ORIENTATIONS = ['portrait', 'landscape'];
const ALLOWED_COLOR_TYPES = ['color', 'bw'];
const ALLOWED_SIDES = ['single', 'double'];

function validateOrder(req, res, next) {
  const { printSettings } = req.body;

  if (!printSettings) {
    return res.status(400).json({ error: 'printSettings is required', field: 'printSettings' });
  }

  const { totalPages, copies, mode, binding, priority, paperSize, orientation, pageRanges } = printSettings;

  // Validate totalPages: positive integer between 1 and 10000
  if (totalPages === undefined || totalPages === null) {
    return res.status(400).json({ error: 'totalPages is required', field: 'totalPages' });
  }
  if (!Number.isInteger(totalPages) || typeof totalPages !== 'number') {
    return res.status(400).json({ error: 'totalPages must be an integer', field: 'totalPages' });
  }
  if (totalPages < 1 || totalPages > 10000) {
    return res.status(400).json({ error: 'totalPages must be between 1 and 10000', field: 'totalPages' });
  }

  // Validate copies: integer between 1 and 100
  if (copies === undefined || copies === null) {
    return res.status(400).json({ error: 'copies is required', field: 'copies' });
  }
  if (!Number.isInteger(copies) || typeof copies !== 'number') {
    return res.status(400).json({ error: 'copies must be an integer', field: 'copies' });
  }
  if (copies < 1 || copies > 100) {
    return res.status(400).json({ error: 'copies must be between 1 and 100', field: 'copies' });
  }

  // Validate mode
  if (mode && !ALLOWED_MODES.includes(mode)) {
    return res.status(400).json({ error: `mode must be one of: ${ALLOWED_MODES.join(', ')}`, field: 'mode' });
  }

  // Validate binding
  if (binding && !ALLOWED_BINDINGS.includes(binding)) {
    return res.status(400).json({ error: `binding must be one of: ${ALLOWED_BINDINGS.join(', ')}`, field: 'binding' });
  }

  // Validate priority
  if (priority && !ALLOWED_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: `priority must be one of: ${ALLOWED_PRIORITIES.join(', ')}`, field: 'priority' });
  }

  // Validate paperSize
  if (paperSize && !ALLOWED_PAPER_SIZES.includes(paperSize)) {
    return res.status(400).json({ error: `paperSize must be one of: ${ALLOWED_PAPER_SIZES.join(', ')}`, field: 'paperSize' });
  }

  // Validate orientation
  if (orientation && !ALLOWED_ORIENTATIONS.includes(orientation)) {
    return res.status(400).json({ error: `orientation must be one of: ${ALLOWED_ORIENTATIONS.join(', ')}`, field: 'orientation' });
  }

  // Validate page-range mode requires non-empty pageRanges
  if (mode === 'page-range') {
    if (!pageRanges || !Array.isArray(pageRanges) || pageRanges.length === 0) {
      return res.status(400).json({ error: 'At least one page range is required when mode is page-range', field: 'pageRanges' });
    }

    // Validate each page range
    for (let i = 0; i < pageRanges.length; i++) {
      const range = pageRanges[i];
      const { from, to, colorType, side } = range;

      // Validate from: integer >= 1 and <= totalPages
      if (from === undefined || from === null) {
        return res.status(400).json({ error: `pageRanges[${i}].from is required`, field: `pageRanges[${i}].from` });
      }
      if (!Number.isInteger(from) || typeof from !== 'number') {
        return res.status(400).json({ error: `pageRanges[${i}].from must be an integer`, field: `pageRanges[${i}].from` });
      }
      if (from < 1) {
        return res.status(400).json({ error: `pageRanges[${i}].from must be greater than or equal to 1`, field: `pageRanges[${i}].from` });
      }
      if (from > totalPages) {
        return res.status(400).json({ error: `pageRanges[${i}].from must be less than or equal to totalPages (${totalPages})`, field: `pageRanges[${i}].from` });
      }

      // Validate to: integer >= from and <= totalPages
      if (to === undefined || to === null) {
        return res.status(400).json({ error: `pageRanges[${i}].to is required`, field: `pageRanges[${i}].to` });
      }
      if (!Number.isInteger(to) || typeof to !== 'number') {
        return res.status(400).json({ error: `pageRanges[${i}].to must be an integer`, field: `pageRanges[${i}].to` });
      }
      if (to < from) {
        return res.status(400).json({ error: `pageRanges[${i}].to must be greater than or equal to from (${from})`, field: `pageRanges[${i}].to` });
      }
      if (to > totalPages) {
        return res.status(400).json({ error: `pageRanges[${i}].to must be less than or equal to totalPages (${totalPages})`, field: `pageRanges[${i}].to` });
      }

      // Validate colorType if provided
      if (colorType && !ALLOWED_COLOR_TYPES.includes(colorType)) {
        return res.status(400).json({ error: `pageRanges[${i}].colorType must be one of: ${ALLOWED_COLOR_TYPES.join(', ')}`, field: `pageRanges[${i}].colorType` });
      }

      // Validate side if provided
      if (side && !ALLOWED_SIDES.includes(side)) {
        return res.status(400).json({ error: `pageRanges[${i}].side must be one of: ${ALLOWED_SIDES.join(', ')}`, field: `pageRanges[${i}].side` });
      }
    }
  }

  next();
}

module.exports = validateOrder;
