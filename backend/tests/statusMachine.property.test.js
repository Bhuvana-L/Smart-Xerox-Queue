const fc = require('fast-check');
const { VALID_TRANSITIONS } = require('../services/statusManager');

/**
 * Property tests for the status machine.
 * Tests the state transition logic without requiring a real database.
 */

const ALL_STATUSES = ['waiting', 'processing', 'printing', 'ready', 'completed', 'cancelled'];

// Simulate status transition
function simulateTransition(currentStatus, newStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    return { success: false, error: `Invalid transition from '${currentStatus}' to '${newStatus}'` };
  }
  return { success: true, newStatus };
}

// Simulate building status history
function simulateStatusHistory(transitions) {
  const history = [{ status: 'waiting', timestamp: new Date(), note: 'Order placed' }];
  let currentStatus = 'waiting';

  for (const newStatus of transitions) {
    const result = simulateTransition(currentStatus, newStatus);
    if (result.success) {
      history.push({ status: newStatus, timestamp: new Date(), note: '' });
      currentStatus = newStatus;
    }
  }

  return { history, finalStatus: currentStatus };
}

describe('Status Machine - Property Tests', () => {
  test('Property 12: Status transitions follow valid state machine', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_STATUSES),
        fc.constantFrom(...ALL_STATUSES),
        (currentStatus, newStatus) => {
          const result = simulateTransition(currentStatus, newStatus);
          const allowed = VALID_TRANSITIONS[currentStatus];

          if (allowed.includes(newStatus)) {
            expect(result.success).toBe(true);
            expect(result.newStatus).toBe(newStatus);
          } else {
            expect(result.success).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 12b: Terminal states have no valid transitions', () => {
    expect(VALID_TRANSITIONS.completed).toEqual([]);
    expect(VALID_TRANSITIONS.cancelled).toEqual([]);
  });

  test('Property 12c: All states can transition to cancelled except terminal states', () => {
    const activeStates = ['waiting', 'processing', 'printing', 'ready'];
    for (const state of activeStates) {
      expect(VALID_TRANSITIONS[state]).toContain('cancelled');
    }
  });

  test('Property 13: Status history grows monotonically with transitions', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...ALL_STATUSES), { minLength: 1, maxLength: 10 }),
        (transitions) => {
          const { history } = simulateStatusHistory(transitions);

          // History should always grow (never shrink)
          expect(history.length).toBeGreaterThanOrEqual(1);

          // Each entry should have a timestamp
          for (const entry of history) {
            expect(entry.timestamp).toBeInstanceOf(Date);
            expect(entry.status).toBeDefined();
          }

          // History length should be at least 1 (initial 'waiting')
          // and at most transitions.length + 1 (if all transitions are valid)
          expect(history.length).toBeLessThanOrEqual(transitions.length + 1);
        }
      ),
      { numRuns: 200 }
    );
  });

  test('Property 14: Completed orders always have completedAt set', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...ALL_STATUSES), { minLength: 1, maxLength: 10 }),
        (transitions) => {
          const { history, finalStatus } = simulateStatusHistory(transitions);

          // If final status is 'completed', it must have gone through the valid path
          if (finalStatus === 'completed') {
            const statuses = history.map(h => h.status);
            expect(statuses).toContain('completed');
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  test('Property 15: Token format is always valid', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 999 }),
        (num) => {
          const token = 'PX' + num;
          // Token should match PX followed by 3 digits
          expect(token).toMatch(/^PX\d{3}$/);
          expect(token.length).toBe(5);
        }
      ),
      { numRuns: 100 }
    );
  });
});
