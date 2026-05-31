# Requirements Document

## Introduction

The Smart Xerox Queue Management System is a full-stack web application that digitizes the print shop workflow. Students upload documents, configure per-page-range printing preferences (color/B&W, single/double-sided, binding), and submit print orders. The system calculates costs automatically, assigns a FIFO queue position with a unique token, and provides real-time status tracking via Socket.IO. The shop owner receives orders on a dedicated dashboard, manages the print queue, updates statuses, and triggers file auto-deletion upon completion.

## Glossary

- **System**: The Smart Xerox Queue Management System as a whole
- **Cost_Engine**: The cost calculation component that computes printing costs based on per-page-range settings
- **Page_Map_Builder**: The component that constructs a per-page visualization array showing settings for each page
- **Queue_Manager**: The component that manages FIFO ordering of print jobs and assigns queue positions
- **Notification_Service**: The Socket.IO-based real-time notification component
- **File_Cleanup_Scheduler**: The component that handles automatic file deletion after order completion
- **Order**: A print job submitted by a student, containing file reference, print settings, cost, and status
- **Page_Range**: A contiguous set of pages with specific print settings (color type, side)
- **Token**: A unique identifier assigned to each order (format: 'PX' + 3 digits)
- **Status_Machine**: The state machine governing order lifecycle transitions
- **Owner_Dashboard**: The shop owner's interface for managing the print queue
- **Student_Dashboard**: The student's interface for submitting orders and tracking status

## Requirements

### Requirement 1: Document Upload

**User Story:** As a student, I want to upload my document to the system, so that I can submit it for printing.

#### Acceptance Criteria

1. WHEN a student uploads a file in a supported format (PDF, DOCX, PPT, PPTX, JPG, JPEG, PNG, or ZIP) not exceeding 50MB with a valid JWT token in the Authorization header, THE System SHALL store the file in the uploads directory and return a JSON response containing the generated file name, original file name, file URL, file type, and file size in bytes
2. IF a student uploads a file exceeding 50MB, THEN THE System SHALL reject the upload and return a 400 error with a message indicating the file size limit has been exceeded
3. IF a student uploads a file with an extension other than .pdf, .docx, .ppt, .pptx, .jpg, .jpeg, .png, or .zip, THEN THE System SHALL reject the upload and return a 400 error with a message indicating the file type is not supported
4. IF a file upload request contains no JWT token or contains an invalid or expired JWT token, THEN THE System SHALL reject the request with a 401 error and a message indicating authorization failure
5. IF a file upload request does not include a file in the "document" form field, THEN THE System SHALL reject the request and return a 400 error with a message indicating no file was uploaded

### Requirement 2: Print Settings Configuration

**User Story:** As a student, I want to configure per-page-range printing preferences, so that I can specify different settings for different sections of my document.

#### Acceptance Criteria

1. WHEN a student selects 'whole' mode, THE System SHALL apply the specified color type and side settings uniformly to all pages in the document
2. WHEN a student selects 'page-range' mode and provides at least one page range, THE System SHALL allow specifying multiple page ranges each with independent color type and side settings, where each range has a 'from' value greater than or equal to 1 and a 'to' value less than or equal to totalPages, and 'from' is less than or equal to 'to'
3. THE System SHALL support color types of 'color' and 'bw' for each page range
4. THE System SHALL support side options of 'single' and 'double' for each page range
5. THE System SHALL support paper sizes of 'A4', 'A3', and 'Legal'
6. THE System SHALL support binding options of 'none', 'spiral', 'stapling', and 'lamination'
7. THE System SHALL support priority levels of 'normal' and 'urgent'
8. THE System SHALL support copies between 1 and 100 inclusive
9. IF a student selects 'page-range' mode and submits overlapping page ranges, THEN THE System SHALL resolve each overlapping page using the settings from the first range that covers it
10. IF a student selects 'page-range' mode and some pages are not covered by any specified range, THEN THE System SHALL treat uncovered pages with default settings of 'bw' color type and 'single' side
11. IF a student selects 'page-range' mode and provides no page ranges, THEN THE System SHALL reject the configuration with an error message indicating that at least one page range is required

### Requirement 3: Cost Calculation

**User Story:** As a student, I want the system to automatically calculate my printing cost, so that I know the exact amount before submitting my order.

#### Acceptance Criteria

1. WHEN print settings are provided in 'whole' mode, THE Cost_Engine SHALL calculate the total cost as the sum of (colorPages × copies × ₹10) or (bwPages × copies × ₹2) for page costs, plus double-side surcharge, binding cost, and urgent surcharge
2. WHEN print settings are provided in 'page-range' mode, THE Cost_Engine SHALL assign each page to the first range that covers it using first-write-wins resolution, and SHALL treat any page not covered by any range as B&W single-sided by default
3. THE Cost_Engine SHALL price color pages at ₹10 per page per copy and B&W pages at ₹2 per page per copy
4. THE Cost_Engine SHALL apply a ₹1.5 surcharge per double-sided page per copy, rounding the total double-side surcharge to the nearest integer (₹)
5. THE Cost_Engine SHALL apply binding costs of ₹0 for none, ₹30 for spiral, ₹5 for stapling, and ₹20 for lamination
6. THE Cost_Engine SHALL apply a flat ₹20 surcharge for urgent priority orders and ₹0 for normal priority orders
7. THE Cost_Engine SHALL produce a total cost equal to the sum of colorPagesCost, bwPagesCost, doubleSideCost, bindingCost, and urgentSurcharge
8. THE Cost_Engine SHALL account for every page such that colorPages plus bwPages equals totalPages
9. THE Cost_Engine SHALL produce non-negative values for all cost fields and the total
10. IF totalPages is less than 1, or copies is less than 1 or greater than 100, or binding is not one of none/spiral/stapling/lamination, or priority is not one of normal/urgent, THEN THE Cost_Engine SHALL reject the input and return an error indicating the invalid parameter

### Requirement 4: Page Map Visualization

**User Story:** As a student, I want to see a visual representation of my page settings, so that I can verify my configuration before submitting.

#### Acceptance Criteria

1. WHEN page ranges and a total page count (minimum 1) are provided, THE Page_Map_Builder SHALL produce an array of exactly totalPages entries, each containing page (1-indexed), colorType, side, hasConflict, and label fields
2. IF a page is covered by exactly one range, THEN THE Page_Map_Builder SHALL assign that range's colorType and side to the entry, set hasConflict to false, and assign label 'C' if colorType is 'color' or 'B' if colorType is 'bw'
3. IF a page is not covered by any range, THEN THE Page_Map_Builder SHALL assign colorType 'default', side 'default', hasConflict false, and label '?'
4. IF a page is covered by two or more ranges, THEN THE Page_Map_Builder SHALL set hasConflict to true, assign label '!', and use the colorType and side from the first range in input array order that covers that page
5. IF totalPages is less than 1 or the ranges array is not provided, THEN THE Page_Map_Builder SHALL return an empty array

### Requirement 5: Conflict Detection

**User Story:** As a student, I want to be notified of overlapping page ranges, so that I can correct my configuration before submitting.

#### Acceptance Criteria

1. WHEN page ranges are provided, THE Cost_Engine SHALL detect all pages covered by two or more ranges (where a page p is covered by a range if range.from ≤ p ≤ range.to) and return them as conflict entries, each containing the page number and the 0-based indices of all ranges that cover that page
2. IF a page is covered by two or more ranges, THEN THE Cost_Engine SHALL include that page in the conflict result with the 0-based indices of every range whose from-to interval includes that page
3. THE Cost_Engine SHALL return conflicts sorted by page number in ascending order
4. IF no pages are covered by multiple ranges, THEN THE Cost_Engine SHALL return an empty conflict array
5. WHEN page ranges are provided with a totalPages parameter, THE Cost_Engine SHALL only evaluate pages from 1 to totalPages (clamping each range's effective upper bound to totalPages) for conflict detection

### Requirement 6: Order Submission

**User Story:** As a student, I want to submit my print order, so that it enters the print queue and I receive a tracking token.

#### Acceptance Criteria

1. WHEN an authenticated student submits a POST request with fileName, fileUrl, printSettings, and originalName, THE System SHALL create the order with status 'waiting', calculate cost using the cost engine, assign a queue position equal to the count of currently active orders (status in waiting, processing, printing) plus one, generate a unique token, set estimatedTime to queuePosition multiplied by 5 minutes, and return the created order with HTTP 201
2. THE System SHALL generate tokens in the format 'PX' followed by 3 random digits in the range 100 to 999 (e.g., 'PX742'), ensuring each token is unique across all orders
3. WHEN an order is created, THE System SHALL record the student name, USN, fileName, originalName, fileUrl, fileType, printSettings, cost breakdown, queue position, estimated time, and creation timestamp
4. IF page ranges contain invalid values where from is greater than to or to exceeds totalPages, THEN THE System SHALL reject the order with a 400 error indicating which page range is invalid
5. IF the request is missing any of the required fields (fileName, fileUrl, or printSettings), THEN THE System SHALL reject the order with a 400 error indicating the missing fields
6. WHEN an order is successfully created, THE System SHALL emit a 'new-order' event via Socket.IO to the owner-room containing the order token, student name, total pages, cost total, and status

### Requirement 7: Queue Management

**User Story:** As a student, I want to know my position in the print queue and estimated wait time, so that I can plan accordingly.

#### Acceptance Criteria

1. WHEN a new order is created, THE Queue_Manager SHALL assign a queue position equal to the count of existing active orders (excluding the new order itself) plus one
2. THE Queue_Manager SHALL calculate estimated wait time in minutes as queue position multiplied by 5
3. WHEN an order is completed or cancelled, THE Queue_Manager SHALL recalculate positions for all remaining active orders in ascending createdAt order (FIFO), assigning sequential positions starting from 1 with no gaps
4. WHEN queue positions are recalculated, THE Queue_Manager SHALL emit a queue-update notification to each affected student containing their updated queue position and estimated wait time
5. THE Queue_Manager SHALL consider orders with status 'waiting', 'processing', or 'printing' as active orders
6. WHEN a student retrieves their order, THE Queue_Manager SHALL include the current queue position and estimated wait time in minutes in the response

### Requirement 8: Order Status Management

**User Story:** As a shop owner, I want to update order statuses through a defined workflow, so that students can track their order progress.

#### Acceptance Criteria

1. THE Status_Machine SHALL enforce the following valid transitions: waiting to processing, processing to printing, printing to ready, ready to completed
2. THE Status_Machine SHALL allow transition from any active status (waiting, processing, printing, ready) to cancelled
3. THE Status_Machine SHALL not allow any transitions from completed or cancelled states
4. WHEN a status transition occurs, THE System SHALL append an entry to the order's statusHistory with the new status, current timestamp, and an optional note of no more than 500 characters
5. WHEN an order transitions to 'completed', THE System SHALL set the completedAt timestamp to the current server time
6. IF an invalid status transition is attempted, THEN THE System SHALL reject the request with a 400 error and include the list of valid target statuses from the order's current state
7. WHEN a new order is created, THE System SHALL initialize the statusHistory with an entry containing the status 'waiting' and the current timestamp
8. IF a status transition is attempted on an order that does not exist, THEN THE System SHALL return a 404 error indicating the order was not found

### Requirement 9: Real-Time Notifications

**User Story:** As a student, I want to receive real-time updates about my order status, so that I do not need to manually refresh the page.

#### Acceptance Criteria

1. WHEN a new order is created, THE Notification_Service SHALL emit a 'new-order' event to the owner-room containing the order token, student name, total page count, total cost, and current status
2. WHEN an order status changes to any of 'processing', 'printing', 'ready', 'completed', or 'cancelled', THE Notification_Service SHALL emit a 'status-update' event to the order-specific room (order-{token}) containing the order token, new status, and estimated time remaining in minutes
3. WHEN an order status changes to 'completed' or 'cancelled', THE Notification_Service SHALL recalculate queue positions for all orders with status 'waiting' or 'processing' and emit a 'queue-update' event to each affected order room (order-{token}) containing the updated queue position (integer starting from 1) and estimated time in minutes (calculated as queue position multiplied by 5)
4. WHEN a student emits a 'join-order' event with a token value, THE System SHALL add the student's socket to the room named 'order-{token}'
5. WHEN the shop owner emits a 'join-owner' event, THE System SHALL add the owner's socket to the 'owner-room'
6. IF a client disconnects and reconnects within 30 seconds, THEN THE System SHALL allow the client to re-join rooms by re-emitting the appropriate join event, and the client SHALL retrieve current order state via the GET /api/orders/track/{token} endpoint
7. WHEN an order status is updated by the owner, THE Notification_Service SHALL emit an 'order-updated' event to the owner-room containing the order ID, new status, and order token within 1 second of the status change being persisted

### Requirement 10: File Cleanup

**User Story:** As a system administrator, I want uploaded files to be automatically deleted after order completion, so that storage is managed efficiently and student privacy is protected.

#### Acceptance Criteria

1. WHEN an order transitions to 'completed' or 'cancelled', THE File_Cleanup_Scheduler SHALL schedule file deletion with a 1-hour delay
2. WHEN the scheduled deletion time arrives, THE File_Cleanup_Scheduler SHALL delete the file from storage and update the order record with a fileDeletedAt timestamp set to the current time
3. WHEN the server starts, THE File_Cleanup_Scheduler SHALL scan for and delete files that have no matching order with status in ['waiting', 'processing', 'printing', 'ready'] and whose associated order was completed or cancelled more than 1 hour ago
4. IF a file has already been deleted when scheduled deletion runs, THEN THE File_Cleanup_Scheduler SHALL skip the file system deletion, log the occurrence, and set the fileDeletedAt timestamp on the order record if not already set
5. IF file deletion fails due to a file system error, THEN THE File_Cleanup_Scheduler SHALL log the error and retry deletion up to 3 times with a 5-minute interval between attempts before marking the deletion as failed

### Requirement 11: Authentication and Authorization

**User Story:** As a system user, I want secure access to the system based on my role, so that only authorized actions are permitted.

#### Acceptance Criteria

1. THE System SHALL require a valid JWT token in the Authorization header using the Bearer scheme for all API endpoints except the health check, login, and registration endpoints
2. THE System SHALL assign each user exactly one role from the set: 'student', 'owner', or 'admin', with 'student' as the default role upon registration
3. WHEN a request targets owner-only endpoints, THE System SHALL verify the user has the 'owner' or 'admin' role and reject unauthorized access with a 403 error response
4. WHEN a user registers with a password, THE System SHALL store the password using bcrypt hashing with a cost factor of 10 salt rounds
5. IF a request contains an invalid or expired JWT token, THEN THE System SHALL return a 401 unauthorized error response
6. IF a request to a protected endpoint contains no JWT token, THEN THE System SHALL return a 401 unauthorized error response
7. WHEN a user successfully authenticates, THE System SHALL issue a JWT token with an expiration time of 7 days

### Requirement 12: Input Validation

**User Story:** As a developer, I want all inputs validated server-side, so that the system maintains data integrity regardless of client behavior.

#### Acceptance Criteria

1. WHEN page ranges are submitted, THE System SHALL validate that each range has from as an integer greater than or equal to 1 and less than or equal to totalPages
2. WHEN page ranges are submitted, THE System SHALL validate that each range has to as an integer greater than or equal to from and less than or equal to totalPages
3. WHEN copies are submitted, THE System SHALL validate the value is an integer between 1 and 100 inclusive
4. WHEN totalPages is submitted, THE System SHALL validate the value is a positive integer greater than or equal to 1 and less than or equal to 10000
5. IF any validation fails, THEN THE System SHALL return a 400 error with a message that identifies the invalid field name and the constraint that was violated
6. IF printSettings mode is "page-range" and the pageRanges array is empty or missing, THEN THE System SHALL return a 400 error identifying that at least one page range is required
7. IF any numeric field (copies, totalPages, from, to) is submitted as a non-integer or non-numeric value, THEN THE System SHALL return a 400 error identifying the field and indicating that an integer value is required

### Requirement 13: Concurrent Access Handling

**User Story:** As a shop owner, I want the system to handle simultaneous updates safely, so that order data remains consistent.

#### Acceptance Criteria

1. WHEN a status update is submitted for an order, THE System SHALL read the current document version and include it as a condition in the update operation, so that the update only succeeds if the document has not been modified since it was read
2. IF the document version at save time does not match the version that was read, THEN THE System SHALL reject the update with a 409 Conflict response that includes the current order state as retrieved from the database
3. WHEN the Owner_Dashboard receives a 409 Conflict response, THE Owner_Dashboard SHALL replace the displayed order data with the current order state from the response body and present the retry option to the owner within 1 second of receiving the response
4. IF the owner retries a status update after a conflict and the intended status transition is no longer valid for the current order state, THEN THE System SHALL return a 400 error indicating the transition is not permitted from the current status
