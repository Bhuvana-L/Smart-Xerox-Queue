
# Implementation Plan: Smart Xerox Queue Management System

## Overview

This plan implements the Smart Xerox Queue Management System by enhancing the existing Express.js/MongoDB/Socket.IO backend with a page-range-aware cost engine, page map builder with conflict detection, FIFO queue manager, status machine with valid transitions, real-time Socket.IO notifications, and scheduled file cleanup. Tasks build incrementally on the existing codebase.

## Tasks

- [x] 1. Enhance Cost Calculation Engine and Page Map Builder
  - [x] 1.1 Enhance `controllers/costController.js` with page-range cost calculation, page map builder, and conflict detection
    - Add `colorPages` and `bwPages` counts to the returned cost breakdown object
    - Implement `buildPageMap(ranges, totalPages)` function that returns an array of `PageMapEntry` objects with page, colorType, side, hasConflict, and label fields
    - Implement `detectConflicts(ranges, totalPages)` function that returns conflict entries sorted by page number ascending, each with page number and array of 0-based range indices
    - Export `buildPageMap`, `detectConflicts`, `calculateCost`, and `PRICES`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x]* 1.2 Write property tests for cost calculation (Properties 1, 2, 3, 4)
    - **Property 1: Cost total is always the sum of its components**
    - **Property 2: All pages are accounted for in cost calculation**
    - **Property 3: Cost is always non-negative**
    - **Property 4: Double-side cost only applies to double-sided pages**
    - Install `fast-check` and `jest` as dev dependencies
    - Create `tests/costCalculation.property.test.js`
    - **Validates: Requirements 3.1, 3.4, 3.7, 3.8, 3.9**

  - [x]* 1.3 Write property tests for page map builder (Properties 5, 6, 17)
    - **Property 5: Page map has exactly totalPages entries**
    - **Property 6: Page map labeling is consistent with coverage**
    - **Property 17: First-write-wins resolution for overlapping ranges**
    - Create `tests/pageMapBuilder.property.test.js`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 3.2**

  - [x]* 1.4 Write property tests for conflict detection (Properties 7, 8, 9)
    - **Property 7: Conflict detection is consistent with page map**
    - **Property 8: Conflicts are sorted by page number**
    - **Property 9: Non-overlapping ranges produce no conflicts**
    - Create `tests/conflictDetection.property.test.js`
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 2. Implement Queue Manager Service
  - [x] 2.1 Create `services/queueManager.js` with enqueue, recalculatePositions, and getQueueStatus functions
    - `enqueue(orderId)` assigns queue position = active orders count + 1, estimatedTime = position × 5
    - `recalculatePositions()` reassigns sequential positions starting from 1 in FIFO (createdAt ascending) order using bulkWrite
    - `getQueueStatus()` returns activeCount and estimatedWait
    - Active orders are those with status in ['waiting', 'processing', 'printing']
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x]* 2.2 Write property tests for queue management (Properties 10, 11)
    - **Property 10: Queue positions are sequential starting from 1**
    - **Property 11: Estimated wait time equals position times 5 minutes**
    - Create `tests/queueManager.property.test.js`
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 3. Implement Status Machine and Notification Service
  - [x] 3.1 Create `services/statusManager.js` with `updateOrderStatus` function enforcing valid state transitions
    - Define `VALID_TRANSITIONS` map: waiting→[processing, cancelled], processing→[printing, cancelled], printing→[ready, cancelled], ready→[completed, cancelled], completed→[], cancelled→[]
    - Append to statusHistory with timestamp and note on each transition
    - Set `completedAt` when transitioning to 'completed'
    - Trigger file deletion scheduling on 'completed' or 'cancelled'
    - Trigger queue recalculation when order leaves active queue
    - Use Mongoose document versioning (`__v`) for optimistic concurrency control
    - Return 409 Conflict with current order state if version mismatch
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 13.1, 13.2, 13.4_

  - [x] 3.2 Create `services/notificationService.js` with Socket.IO event emission functions
    - `notifyNewOrder(io, order)` emits 'new-order' to owner-room with token, studentName, totalPages, cost total, status
    - `notifyStatusChange(io, order, newStatus)` emits 'status-update' to `order-{token}` room with token, status, estimatedTime
    - `notifyQueueUpdate(io, updates)` emits 'queue-update' to each affected order room with position and estimatedTime
    - Emit 'order-updated' to owner-room on any status change with order ID, status, token
    - _Requirements: 9.1, 9.2, 9.3, 9.7_

  - [x]* 3.3 Write property tests for status transitions (Properties 12, 13, 14, 15)
    - **Property 12: Status transitions follow valid state machine**
    - **Property 13: Status history grows monotonically with transitions**
    - **Property 14: Completed orders always have completedAt set**
    - **Property 15: Token format is always valid**
    - Create `tests/statusMachine.property.test.js`
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 6.2**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Input Validation and File Cleanup
  - [x] 5.1 Create `middleware/validateOrder.js` with server-side input validation for order submission
    - Validate `totalPages` is a positive integer between 1 and 10000
    - Validate `copies` is an integer between 1 and 100
    - Validate each page range: `from` ≥ 1, `from` ≤ `to`, `to` ≤ `totalPages`, all integers
    - Validate `mode` is 'whole' or 'page-range'; if 'page-range', require non-empty `pageRanges` array
    - Validate `binding`, `priority`, `paperSize`, `orientation` against allowed enum values
    - Return 400 with field name and constraint violation message on failure
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 2.2, 2.8, 2.11, 6.4, 6.5_

  - [x] 5.2 Create `services/fileCleanup.js` with scheduled file deletion and orphan cleanup
    - `scheduleFileDeletion(order, delayMs = 3600000)` schedules file deletion 1 hour after completion/cancellation
    - `cleanupOrphanedFiles()` scans uploads directory on server startup for files without matching active orders completed/cancelled > 1 hour ago
    - `deleteFile(filePath)` deletes file, handles missing files gracefully, retries up to 3 times on failure with 5-minute intervals
    - Update order record with `fileDeletedAt` timestamp after successful deletion
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x]* 5.3 Write property tests for input validation (Property 16)
    - **Property 16: Invalid page ranges are always rejected**
    - Create `tests/inputValidation.property.test.js`
    - **Validates: Requirements 6.4, 12.1, 12.2**

  - [x]* 5.4 Write unit tests for file cleanup scheduler
    - Test scheduled deletion after 1 hour delay
    - Test orphan file cleanup on startup
    - Test retry logic on file system errors
    - Test graceful handling of already-deleted files
    - Create `tests/fileCleanup.test.js`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 6. Enhance Upload Route with Validation
  - [x] 6.1 Enhance `routes/upload.js` with file type and size validation
    - Configure Multer with 50MB file size limit
    - Add file filter for supported formats: .pdf, .docx, .ppt, .pptx, .jpg, .jpeg, .png, .zip
    - Return 400 with descriptive message for oversized files or unsupported formats
    - Return file metadata: generated fileName, originalName, fileUrl, fileType, file size in bytes
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x]* 6.2 Write unit tests for upload validation
    - Test successful upload of each supported format
    - Test rejection of oversized files
    - Test rejection of unsupported file types
    - Test rejection of requests without file
    - Create `tests/upload.test.js`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 7. Wire Components into Routes and Server
  - [x] 7.1 Update `routes/orders.js` to use validation middleware, queue manager, and notification service
    - Add `validateOrder` middleware to POST `/` route
    - Replace inline cost calculation with enhanced `calculateCost` that returns `colorPages` and `bwPages`
    - Use `queueManager.enqueue(orderId)` for queue position assignment
    - Use `notificationService.notifyNewOrder(io, order)` for Socket.IO emission
    - Add `POST /calculate-cost` endpoint that also returns page map and conflicts
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 7.1, 7.6, 9.1_

  - [x] 7.2 Update `routes/owner.js` to use status manager, notification service, and queue recalculation
    - Replace inline status update logic with `statusManager.updateOrderStatus(orderId, newStatus, note, io)`
    - Handle 409 Conflict responses for concurrent access
    - Use `notificationService.notifyStatusChange` and `notifyQueueUpdate` for real-time events
    - Remove inline `scheduleFileDeletion` function (now in `services/fileCleanup.js`)
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 9.2, 9.3, 9.7, 13.1, 13.2, 13.3_

  - [x] 7.3 Update `server.js` to initialize file cleanup on startup and add database index
    - Call `cleanupOrphanedFiles()` after MongoDB connection
    - Add compound index on `{ status: 1, createdAt: 1 }` for efficient queue queries
    - Ensure Socket.IO room join events are handled (already present, verify)
    - _Requirements: 10.3, 9.4, 9.5_

  - [x]* 7.4 Write integration tests for full order lifecycle
    - Test order creation → status updates → completion → file cleanup scheduling
    - Test Socket.IO event emission on status changes
    - Test queue recalculation after order completion
    - Test concurrent status update conflict handling
    - Create `tests/orderLifecycle.integration.test.js`
    - _Requirements: 6.1, 8.1, 9.2, 9.3, 10.1, 13.1, 13.2_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses JavaScript (Node.js) with Express, MongoDB/Mongoose, and Socket.IO
- `fast-check` is used for property-based testing, `jest` for the test runner
- All services are created in a new `backend/services/` directory

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.2", "3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3", "5.1", "5.2", "6.1"] },
    { "id": 3, "tasks": ["5.3", "5.4", "6.2", "7.1", "7.2", "7.3"] },
    { "id": 4, "tasks": ["7.4"] }
  ]
}
```
