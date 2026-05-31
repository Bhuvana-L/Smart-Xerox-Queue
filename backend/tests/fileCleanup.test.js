const path = require('path');

/**
 * Unit tests for file cleanup scheduler.
 * Mocks the filesystem and database to test logic in isolation.
 */

// Mock fs.promises
jest.mock('fs', () => ({
  promises: {
    unlink: jest.fn(),
    readdir: jest.fn()
  }
}));

// Mock the Order model
jest.mock('../models/Order', () => ({
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn()
}));

const fs = require('fs').promises;
const Order = require('../models/Order');
const { deleteFile, scheduleFileDeletion, cleanupOrphanedFiles } = require('../services/fileCleanup');

describe('File Cleanup - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('deleteFile', () => {
    test('successfully deletes a file', async () => {
      fs.unlink.mockResolvedValue(undefined);

      const result = await deleteFile('/uploads/test-file.pdf');
      expect(result).toBe(true);
      expect(fs.unlink).toHaveBeenCalledWith('/uploads/test-file.pdf');
    });

    test('handles already-deleted files gracefully (ENOENT)', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fs.unlink.mockRejectedValue(error);

      const result = await deleteFile('/uploads/missing-file.pdf');
      expect(result).toBe(true);
    });

    test('retries on failure up to 3 times', async () => {
      const error = new Error('Permission denied');
      error.code = 'EPERM';
      fs.unlink.mockRejectedValue(error);

      const deletePromise = deleteFile('/uploads/locked-file.pdf');

      // First attempt fails, schedules retry
      await jest.advanceTimersByTimeAsync(300000); // 5 minutes
      // Second attempt fails, schedules retry
      await jest.advanceTimersByTimeAsync(300000); // 5 minutes

      const result = await deletePromise;
      expect(result).toBe(false);
      expect(fs.unlink).toHaveBeenCalledTimes(3);
    });
  });

  describe('scheduleFileDeletion', () => {
    test('schedules deletion after default 1 hour delay', () => {
      fs.unlink.mockResolvedValue(undefined);
      Order.findByIdAndUpdate.mockResolvedValue({});

      const order = { _id: 'order123', fileName: 'test-file.pdf' };
      scheduleFileDeletion(order);

      // File should not be deleted immediately
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    test('does nothing when order or fileName is missing', () => {
      scheduleFileDeletion(null);
      scheduleFileDeletion({});
      scheduleFileDeletion({ _id: 'test' });

      expect(fs.unlink).not.toHaveBeenCalled();
    });

    test('schedules deletion with custom delay', () => {
      fs.unlink.mockResolvedValue(undefined);
      Order.findByIdAndUpdate.mockResolvedValue({});

      const order = { _id: 'order456', fileName: 'custom-delay.pdf' };
      scheduleFileDeletion(order, 5000);

      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('cleanupOrphanedFiles', () => {
    test('handles missing uploads directory gracefully', async () => {
      const error = new Error('Directory not found');
      error.code = 'ENOENT';
      fs.readdir.mockRejectedValue(error);

      await cleanupOrphanedFiles();
      // Should not throw
    });

    test('skips files with active orders', async () => {
      fs.readdir.mockResolvedValue(['active-file.pdf']);
      Order.findOne.mockResolvedValue({ _id: 'order1', status: 'waiting', fileName: 'active-file.pdf' });

      await cleanupOrphanedFiles();
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    test('handles empty uploads directory', async () => {
      fs.readdir.mockResolvedValue([]);

      await cleanupOrphanedFiles();
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    test('deletes orphaned files without matching orders', async () => {
      fs.readdir.mockResolvedValue(['orphan-file.pdf']);
      // First call: no active order
      // Second call: no completed order
      // Third call: no order at all (truly orphaned)
      Order.findOne
        .mockResolvedValueOnce(null)  // no active order
        .mockResolvedValueOnce(null)  // no completed order
        .mockResolvedValueOnce(null); // no order at all
      fs.unlink.mockResolvedValue(undefined);

      await cleanupOrphanedFiles();
      expect(fs.unlink).toHaveBeenCalled();
    });
  });
});
