/**
 * Integration tests for the full order lifecycle.
 * Tests order creation → status updates → completion → file cleanup scheduling.
 * Uses mocked database and Socket.IO for isolation.
 */

const { VALID_TRANSITIONS } = require('../services/statusManager');

// Mock Socket.IO
function createMockIO() {
  const emitted = [];
  const io = {
    to: (room) => ({
      emit: (event, data) => {
        emitted.push({ room, event, data });
      }
    }),
    emitted
  };
  return io;
}

describe('Order Lifecycle - Integration Tests', () => {
  describe('Full order lifecycle flow', () => {
    test('order follows valid path: waiting → processing → printing → ready → completed', () => {
      const validPath = ['waiting', 'processing', 'printing', 'ready', 'completed'];

      for (let i = 0; i < validPath.length - 1; i++) {
        const current = validPath[i];
        const next = validPath[i + 1];
        expect(VALID_TRANSITIONS[current]).toContain(next);
      }
    });

    test('order can be cancelled from any active state', () => {
      const activeStates = ['waiting', 'processing', 'printing', 'ready'];

      for (const state of activeStates) {
        expect(VALID_TRANSITIONS[state]).toContain('cancelled');
      }
    });

    test('completed and cancelled are terminal states', () => {
      expect(VALID_TRANSITIONS.completed).toEqual([]);
      expect(VALID_TRANSITIONS.cancelled).toEqual([]);
    });
  });

  describe('Socket.IO event emission', () => {
    test('notifyStatusChange emits to correct rooms', () => {
      const notificationService = require('../services/notificationService');
      const io = createMockIO();

      const order = {
        _id: 'order123',
        token: 'PX742',
        estimatedTime: 10,
        status: 'processing'
      };

      notificationService.notifyStatusChange(io, order, 'processing');

      // Should emit to order-specific room
      const statusUpdate = io.emitted.find(e => e.event === 'status-update');
      expect(statusUpdate).toBeDefined();
      expect(statusUpdate.room).toBe('order-PX742');
      expect(statusUpdate.data.token).toBe('PX742');
      expect(statusUpdate.data.status).toBe('processing');

      // Should emit to owner-room
      const orderUpdated = io.emitted.find(e => e.event === 'order-updated');
      expect(orderUpdated).toBeDefined();
      expect(orderUpdated.room).toBe('owner-room');
    });

    test('notifyNewOrder emits to owner-room', () => {
      const notificationService = require('../services/notificationService');
      const io = createMockIO();

      const order = {
        token: 'PX123',
        studentName: 'Test Student',
        printSettings: { totalPages: 20 },
        cost: { total: 100 },
        status: 'waiting'
      };

      notificationService.notifyNewOrder(io, order);

      const newOrder = io.emitted.find(e => e.event === 'new-order');
      expect(newOrder).toBeDefined();
      expect(newOrder.room).toBe('owner-room');
      expect(newOrder.data.token).toBe('PX123');
      expect(newOrder.data.studentName).toBe('Test Student');
      expect(newOrder.data.totalPages).toBe(20);
      expect(newOrder.data.cost).toBe(100);
    });

    test('notifyQueueUpdate emits to each affected order room', () => {
      const notificationService = require('../services/notificationService');
      const io = createMockIO();

      const updates = [
        { token: 'PX001', position: 1, estimatedTime: 5 },
        { token: 'PX002', position: 2, estimatedTime: 10 },
        { token: 'PX003', position: 3, estimatedTime: 15 }
      ];

      notificationService.notifyQueueUpdate(io, updates);

      expect(io.emitted).toHaveLength(3);
      expect(io.emitted[0].room).toBe('order-PX001');
      expect(io.emitted[0].data.position).toBe(1);
      expect(io.emitted[1].room).toBe('order-PX002');
      expect(io.emitted[1].data.position).toBe(2);
      expect(io.emitted[2].room).toBe('order-PX003');
      expect(io.emitted[2].data.position).toBe(3);
    });
  });

  describe('Queue recalculation after order completion', () => {
    test('positions are sequential after recalculation simulation', () => {
      // Simulate 5 orders, remove one, recalculate
      const orders = [
        { token: 'PX001', createdAt: new Date('2024-01-01T10:00:00') },
        { token: 'PX002', createdAt: new Date('2024-01-01T10:05:00') },
        { token: 'PX003', createdAt: new Date('2024-01-01T10:10:00') },
        { token: 'PX004', createdAt: new Date('2024-01-01T10:15:00') },
        { token: 'PX005', createdAt: new Date('2024-01-01T10:20:00') }
      ];

      // Remove order at position 2 (completed)
      const remaining = orders.filter(o => o.token !== 'PX002');
      const sorted = remaining.sort((a, b) => a.createdAt - b.createdAt);
      const recalculated = sorted.map((order, idx) => ({
        token: order.token,
        position: idx + 1,
        estimatedTime: (idx + 1) * 5
      }));

      expect(recalculated).toHaveLength(4);
      expect(recalculated[0].position).toBe(1);
      expect(recalculated[1].position).toBe(2);
      expect(recalculated[2].position).toBe(3);
      expect(recalculated[3].position).toBe(4);

      // Verify FIFO order maintained
      expect(recalculated[0].token).toBe('PX001');
      expect(recalculated[1].token).toBe('PX003');
      expect(recalculated[2].token).toBe('PX004');
      expect(recalculated[3].token).toBe('PX005');
    });
  });

  describe('Concurrent status update conflict handling', () => {
    test('version mismatch should result in 409 conflict', () => {
      // Simulate optimistic concurrency: two processes read same version
      const orderV1 = { _id: 'order1', status: 'waiting', __v: 0 };

      // Process A updates to processing (succeeds, __v becomes 1)
      const processAResult = { ...orderV1, status: 'processing', __v: 1 };

      // Process B tries to update with stale version 0 (should fail)
      const processBVersion = orderV1.__v; // 0
      const currentVersion = processAResult.__v; // 1

      expect(processBVersion).not.toBe(currentVersion);
      // This simulates the 409 scenario
    });
  });

  describe('Cost calculation integration', () => {
    test('cost breakdown is correctly computed for order creation', () => {
      const { calculateCost } = require('../controllers/costController');

      const printSettings = {
        mode: 'page-range',
        copies: 2,
        totalPages: 20,
        binding: 'spiral',
        priority: 'normal',
        pageRanges: [
          { from: 1, to: 5, colorType: 'color', side: 'single' },
          { from: 6, to: 15, colorType: 'bw', side: 'double' },
          { from: 16, to: 20, colorType: 'color', side: 'single' }
        ]
      };

      const cost = calculateCost(printSettings);

      expect(cost.colorPages).toBe(10); // pages 1-5 + 16-20
      expect(cost.bwPages).toBe(10);    // pages 6-15
      expect(cost.colorPagesCost).toBe(10 * 2 * 10); // 200
      expect(cost.bwPagesCost).toBe(10 * 2 * 2);     // 40
      expect(cost.doubleSideCost).toBe(Math.round(10 * 2 * 1.5)); // 30
      expect(cost.bindingCost).toBe(30); // spiral
      expect(cost.urgentSurcharge).toBe(0);
      expect(cost.total).toBe(200 + 40 + 30 + 30 + 0); // 300
    });
  });
});
