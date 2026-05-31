const { print, getPrinters } = require('pdf-to-printer');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

/**
 * Get list of available printers on this computer.
 */
async function getAvailablePrinters() {
  try {
    return await getPrinters();
  } catch (err) {
    console.error('[PrintService] Error getting printers:', err.message);
    return [];
  }
}

/**
 * Send a file to the printer with the student's preferences.
 * 
 * Routing logic:
 * - If order has ANY color pages → sends to Color Printer
 * - If order is ALL B&W → sends to B&W Printer
 * 
 * @param {object} order - The order document
 * @param {object} options - Print options
 * @param {string} options.printerName - B&W printer name
 * @param {string} options.colorPrinterName - Color printer name
 */
async function printOrder(order, options = {}) {
  const filePath = path.join(UPLOADS_DIR, order.fileName);

  if (!fs.existsSync(filePath)) {
    return { success: false, message: 'File not found: ' + order.fileName };
  }

  const ps = order.printSettings;
  const copies = ps.copies || 1;

  // Determine if order has any color pages
  let hasColorPages = false;
  if (ps.mode === 'page-range' && ps.pageRanges && ps.pageRanges.length > 0) {
    hasColorPages = ps.pageRanges.some(r => r.colorType === 'color');
  } else {
    hasColorPages = ps.colorType === 'color';
  }

  // Route to correct printer
  // ANY color pages → Color Printer
  // ALL B&W → B&W Printer
  const targetPrinter = hasColorPages
    ? (options.colorPrinterName || options.printerName || undefined)
    : (options.printerName || undefined);

  // Build print options
  const printOptions = {};
  if (targetPrinter) printOptions.printer = targetPrinter;
  if (copies > 1) printOptions.copies = copies;
  if (ps.orientation === 'landscape') printOptions.orientation = 'landscape';

  // Double-side (duplex)
  const hasDoubleSide = ps.mode === 'page-range'
    ? (ps.pageRanges || []).some(r => r.side === 'double')
    : ps.side === 'double';
  if (hasDoubleSide) printOptions.side = 'duplex';

  try {
    const printerLabel = targetPrinter || 'default printer';
    console.log(`[PrintService] Sending ${order.token} to ${printerLabel} (${hasColorPages ? 'COLOR' : 'B&W'})`);
    console.log(`[PrintService] Settings: ${copies} copies, ${ps.orientation}, ${hasDoubleSide ? 'duplex' : 'single-side'}`);

    await print(filePath, printOptions);

    const message = `Sent to ${printerLabel} (${hasColorPages ? 'Color' : 'B&W'})`;
    console.log(`[PrintService] ✓ ${message}`);
    return { success: true, message };
  } catch (err) {
    console.error(`[PrintService] ✗ Print failed:`, err.message);
    return { success: false, message: 'Print failed: ' + err.message };
  }
}

module.exports = { printOrder, getAvailablePrinters };
