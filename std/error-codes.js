/**
 * Pulse Unified Error Code System
 *
 * Provides error codes for all runtime, database, and HTTP operations.
 * Enables programmatic error handling and structured error responses.
 *
 * Categories:
 * - PULSE001-199: Compiler errors (lib/errors.js)
 * - PULSE_RUNTIME_xxx: Runtime errors (scheduler, channels, select)
 * - PULSE_DB_xxx: Database errors (postgres, mysql, transactions)
 * - PULSE_REDIS_xxx: Redis errors
 * - PULSE_HTTP_xxx: HTTP errors
 */

/**
 * Runtime Error Codes (Scheduler, Channels, Select)
 */
export const RuntimeErrors = {
  // Scheduler errors (200-219)
  PULSE_RUNTIME_200: 'PULSE_RUNTIME_200',
  PULSE_RUNTIME_201: 'PULSE_RUNTIME_201',
  PULSE_RUNTIME_202: 'PULSE_RUNTIME_202',
  PULSE_RUNTIME_203: 'PULSE_RUNTIME_203',
  PULSE_RUNTIME_204: 'PULSE_RUNTIME_204',

  // Channel errors (220-239)
  PULSE_RUNTIME_220: 'PULSE_RUNTIME_220',
  PULSE_RUNTIME_221: 'PULSE_RUNTIME_221',
  PULSE_RUNTIME_222: 'PULSE_RUNTIME_222',
  PULSE_RUNTIME_223: 'PULSE_RUNTIME_223',

  // Select errors (240-249)
  PULSE_RUNTIME_240: 'PULSE_RUNTIME_240',
  PULSE_RUNTIME_241: 'PULSE_RUNTIME_241',
  PULSE_RUNTIME_242: 'PULSE_RUNTIME_242',

  // Async/Cancellation errors (250-269)
  PULSE_RUNTIME_250: 'PULSE_RUNTIME_250',
  PULSE_RUNTIME_251: 'PULSE_RUNTIME_251',
  PULSE_RUNTIME_252: 'PULSE_RUNTIME_252',
  PULSE_RUNTIME_260: 'PULSE_RUNTIME_260',
  PULSE_RUNTIME_261: 'PULSE_RUNTIME_261',

  // PulsePromise/AsyncGroup errors (262-269) - M14.4
  PULSE_RUNTIME_262: 'PULSE_RUNTIME_262',
  PULSE_RUNTIME_263: 'PULSE_RUNTIME_263',
  PULSE_RUNTIME_264: 'PULSE_RUNTIME_264',
  PULSE_RUNTIME_265: 'PULSE_RUNTIME_265',
  PULSE_RUNTIME_266: 'PULSE_RUNTIME_266',
  PULSE_RUNTIME_267: 'PULSE_RUNTIME_267',
  PULSE_RUNTIME_268: 'PULSE_RUNTIME_268',
  PULSE_RUNTIME_269: 'PULSE_RUNTIME_269',

  // Supervisor errors (270-279)
  PULSE_RUNTIME_270: 'PULSE_RUNTIME_270',
  PULSE_RUNTIME_271: 'PULSE_RUNTIME_271',
  PULSE_RUNTIME_272: 'PULSE_RUNTIME_272',

  // Debugger errors (280-289)
  PULSE_RUNTIME_280: 'PULSE_RUNTIME_280',
  PULSE_RUNTIME_281: 'PULSE_RUNTIME_281',
  PULSE_RUNTIME_282: 'PULSE_RUNTIME_282',
  PULSE_RUNTIME_283: 'PULSE_RUNTIME_283',
  PULSE_RUNTIME_284: 'PULSE_RUNTIME_284',
  PULSE_RUNTIME_285: 'PULSE_RUNTIME_285',
  PULSE_RUNTIME_286: 'PULSE_RUNTIME_286',

  // Inspector errors (290-299)
  PULSE_RUNTIME_290: 'PULSE_RUNTIME_290',
  PULSE_RUNTIME_291: 'PULSE_RUNTIME_291',
  PULSE_RUNTIME_292: 'PULSE_RUNTIME_292',
  PULSE_RUNTIME_293: 'PULSE_RUNTIME_293',
  PULSE_RUNTIME_294: 'PULSE_RUNTIME_294',

  // AsyncGroup timeout errors (295-299) - M14.3
  PULSE_RUNTIME_298: 'PULSE_RUNTIME_298', // DeadlockTimeoutError

  // Supervisor hierarchy errors (296-297) - M14.2
  PULSE_RUNTIME_296: 'PULSE_RUNTIME_296', // SupervisorExhaustedError
  PULSE_RUNTIME_297: 'PULSE_RUNTIME_297', // SupervisorCircularError

  // Package Manager errors (400-419)
  PULSE_PKG_400: 'PULSE_PKG_400',
  PULSE_PKG_401: 'PULSE_PKG_401',
  PULSE_PKG_402: 'PULSE_PKG_402',
  PULSE_PKG_403: 'PULSE_PKG_403',
  PULSE_PKG_404: 'PULSE_PKG_404',
  PULSE_PKG_405: 'PULSE_PKG_405',
  PULSE_PKG_406: 'PULSE_PKG_406',
  PULSE_PKG_407: 'PULSE_PKG_407',
  PULSE_PKG_408: 'PULSE_PKG_408',

  // Pulse Runtime Server (PRS) errors (420-439)
  PULSE_PRS_420: 'PULSE_PRS_420',
  PULSE_PRS_421: 'PULSE_PRS_421',
  PULSE_PRS_422: 'PULSE_PRS_422',
  PULSE_PRS_423: 'PULSE_PRS_423',
  PULSE_PRS_424: 'PULSE_PRS_424',
  PULSE_PRS_425: 'PULSE_PRS_425',
  PULSE_PRS_426: 'PULSE_PRS_426',
  PULSE_PRS_427: 'PULSE_PRS_427',
  PULSE_PRS_428: 'PULSE_PRS_428',
  PULSE_PRS_429: 'PULSE_PRS_429',
};

/**
 * Database Error Codes (Postgres, MySQL, Transactions)
 */
export const DatabaseErrors = {
  // Connection errors (300-319)
  PULSE_DB_300: 'PULSE_DB_300',
  PULSE_DB_301: 'PULSE_DB_301',
  PULSE_DB_302: 'PULSE_DB_302',
  PULSE_DB_303: 'PULSE_DB_303',
  PULSE_DB_304: 'PULSE_DB_304',

  // Query errors (320-339)
  PULSE_DB_320: 'PULSE_DB_320',
  PULSE_DB_321: 'PULSE_DB_321',
  PULSE_DB_322: 'PULSE_DB_322',
  PULSE_DB_323: 'PULSE_DB_323',
  PULSE_DB_324: 'PULSE_DB_324',

  // Transaction errors (340-359)
  PULSE_DB_340: 'PULSE_DB_340',
  PULSE_DB_341: 'PULSE_DB_341',
  PULSE_DB_342: 'PULSE_DB_342',
  PULSE_DB_343: 'PULSE_DB_343',
  PULSE_DB_344: 'PULSE_DB_344',
  PULSE_DB_345: 'PULSE_DB_345',

  // Generic database errors (360-379)
  PULSE_DB_360: 'PULSE_DB_360',
  PULSE_DB_361: 'PULSE_DB_361',
  PULSE_DB_362: 'PULSE_DB_362',
};

/**
 * Redis Error Codes
 */
export const RedisErrors = {
  // Connection errors (500-519)
  PULSE_REDIS_500: 'PULSE_REDIS_500',
  PULSE_REDIS_501: 'PULSE_REDIS_501',
  PULSE_REDIS_502: 'PULSE_REDIS_502',

  // Operation errors (520-539)
  PULSE_REDIS_520: 'PULSE_REDIS_520',
  PULSE_REDIS_521: 'PULSE_REDIS_521',
  PULSE_REDIS_522: 'PULSE_REDIS_522',
  PULSE_REDIS_523: 'PULSE_REDIS_523',

  // Pub/sub errors (540-559)
  PULSE_REDIS_540: 'PULSE_REDIS_540',
  PULSE_REDIS_541: 'PULSE_REDIS_541',
  PULSE_REDIS_542: 'PULSE_REDIS_542',
};

/**
 * HTTP Error Codes
 */
export const HttpErrors = {
  // Server errors (600-619)
  PULSE_HTTP_600: 'PULSE_HTTP_600',
  PULSE_HTTP_601: 'PULSE_HTTP_601',
  PULSE_HTTP_602: 'PULSE_HTTP_602',
  PULSE_HTTP_603: 'PULSE_HTTP_603',
  PULSE_HTTP_604: 'PULSE_HTTP_604',

  // Request handling errors (620-639)
  PULSE_HTTP_620: 'PULSE_HTTP_620',
  PULSE_HTTP_621: 'PULSE_HTTP_621',
  PULSE_HTTP_622: 'PULSE_HTTP_622',
  PULSE_HTTP_623: 'PULSE_HTTP_623',

  // Client errors (640-659)
  PULSE_HTTP_640: 'PULSE_HTTP_640',
  PULSE_HTTP_641: 'PULSE_HTTP_641',
  PULSE_HTTP_642: 'PULSE_HTTP_642',
  PULSE_HTTP_643: 'PULSE_HTTP_643',
  PULSE_HTTP_644: 'PULSE_HTTP_644',

  // Routing errors (660-679)
  PULSE_HTTP_660: 'PULSE_HTTP_660',
  PULSE_HTTP_661: 'PULSE_HTTP_661',
  PULSE_HTTP_662: 'PULSE_HTTP_662',
  PULSE_HTTP_663: 'PULSE_HTTP_663',

  // Context errors (680-699)
  PULSE_HTTP_680: 'PULSE_HTTP_680',
  PULSE_HTTP_681: 'PULSE_HTTP_681',
  PULSE_HTTP_682: 'PULSE_HTTP_682',
  PULSE_HTTP_683: 'PULSE_HTTP_683',
};

/**
 * All error codes merged
 */
export const ErrorCodes = {
  // Runtime
  DEADLOCK_DETECTED: RuntimeErrors.PULSE_RUNTIME_200,
  SCHEDULER_ALREADY_RUNNING: RuntimeErrors.PULSE_RUNTIME_201,
  SCHEDULER_NOT_RUNNING: RuntimeErrors.PULSE_RUNTIME_202,
  TASK_LIMIT_EXCEEDED: RuntimeErrors.PULSE_RUNTIME_203,
  INVALID_SLEEP_DURATION: RuntimeErrors.PULSE_RUNTIME_204,
  SEND_ON_CLOSED_CHANNEL: RuntimeErrors.PULSE_RUNTIME_220,
  RECV_ON_CLOSED_CHANNEL: RuntimeErrors.PULSE_RUNTIME_221,
  CHANNEL_ALREADY_CLOSED: RuntimeErrors.PULSE_RUNTIME_222,
  INVALID_CHANNEL_CAPACITY: RuntimeErrors.PULSE_RUNTIME_223,
  SELECT_NO_CASES: RuntimeErrors.PULSE_RUNTIME_240,
  SELECT_INVALID_CASE: RuntimeErrors.PULSE_RUNTIME_241,
  SELECT_MULTIPLE_DEFAULTS: RuntimeErrors.PULSE_RUNTIME_242,
  TIMEOUT: RuntimeErrors.PULSE_RUNTIME_250,
  ASYNC_ALL_FAILED: RuntimeErrors.PULSE_RUNTIME_251,
  ASYNC_RACE_FAILED: RuntimeErrors.PULSE_RUNTIME_252,
  OPERATION_CANCELLED: RuntimeErrors.PULSE_RUNTIME_260,
  CANCELLATION_FAILED: RuntimeErrors.PULSE_RUNTIME_261,

  // PulsePromise errors (M14.4)
  PROMISE_ALREADY_SETTLED: RuntimeErrors.PULSE_RUNTIME_262,
  PROMISE_NOT_REGISTERED: RuntimeErrors.PULSE_RUNTIME_263,
  PROMISE_INVALID_STATE: RuntimeErrors.PULSE_RUNTIME_264,

  // AsyncGroup errors (M14.4)
  ASYNC_GROUP_SETTLED: RuntimeErrors.PULSE_RUNTIME_265,
  ASYNC_GROUP_TASK_LIMIT: RuntimeErrors.PULSE_RUNTIME_266,
  ASYNC_GROUP_CANCELLED: RuntimeErrors.PULSE_RUNTIME_267,
  ASYNC_GROUP_WAIT_TWICE: RuntimeErrors.PULSE_RUNTIME_268,
  ASYNC_GROUP_FAIL_FAST: RuntimeErrors.PULSE_RUNTIME_269,

  SUPERVISOR_CHILD_FAILED: RuntimeErrors.PULSE_RUNTIME_270,
  SUPERVISOR_MAX_RESTARTS: RuntimeErrors.PULSE_RUNTIME_271,
  SUPERVISOR_STOPPED: RuntimeErrors.PULSE_RUNTIME_272,
  SUPERVISOR_EXHAUSTED: RuntimeErrors.PULSE_RUNTIME_296,
  SUPERVISOR_CIRCULAR: RuntimeErrors.PULSE_RUNTIME_297,
  DEBUGGER_NOT_ENABLED: RuntimeErrors.PULSE_RUNTIME_280,
  DEBUGGER_ALREADY_PAUSED: RuntimeErrors.PULSE_RUNTIME_281,
  DEBUGGER_NOT_PAUSED: RuntimeErrors.PULSE_RUNTIME_282,
  INVALID_BREAKPOINT: RuntimeErrors.PULSE_RUNTIME_283,
  BREAKPOINT_NOT_FOUND: RuntimeErrors.PULSE_RUNTIME_284,
  INVALID_FRAME_ID: RuntimeErrors.PULSE_RUNTIME_285,
  EVAL_NOT_SUPPORTED: RuntimeErrors.PULSE_RUNTIME_286,
  INSPECTOR_NOT_ENABLED: RuntimeErrors.PULSE_RUNTIME_290,
  TASK_NOT_FOUND: RuntimeErrors.PULSE_RUNTIME_291,
  CHANNEL_NOT_FOUND: RuntimeErrors.PULSE_RUNTIME_292,
  STATS_NOT_AVAILABLE: RuntimeErrors.PULSE_RUNTIME_293,
  SNAPSHOT_TOO_LARGE: RuntimeErrors.PULSE_RUNTIME_294,
  PACKAGE_NOT_FOUND: RuntimeErrors.PULSE_PKG_400,
  VERSION_NOT_FOUND: RuntimeErrors.PULSE_PKG_401,
  REGISTRY_UNAVAILABLE: RuntimeErrors.PULSE_PKG_402,
  CHECKSUM_MISMATCH: RuntimeErrors.PULSE_PKG_403,
  LOCKFILE_CONFLICT: RuntimeErrors.PULSE_PKG_404,
  INSTALL_FAILED: RuntimeErrors.PULSE_PKG_405,
  INVALID_MANIFEST: RuntimeErrors.PULSE_PKG_406,
  PACKAGE_CORRUPT: RuntimeErrors.PULSE_PKG_407,
  DEPENDENCY_CONFLICT: RuntimeErrors.PULSE_PKG_408,

  // Pulse Runtime Server (PRS)
  PRS_NOT_INITIALIZED: RuntimeErrors.PULSE_PRS_420,
  PRS_PROJECT_NOT_LOADED: RuntimeErrors.PULSE_PRS_421,
  PRS_PROJECT_LOAD_FAILED: RuntimeErrors.PULSE_PRS_422,
  PRS_ENTRY_NOT_FOUND: RuntimeErrors.PULSE_PRS_423,
  PRS_EXECUTION_FAILED: RuntimeErrors.PULSE_PRS_424,
  PRS_INVALID_REQUEST: RuntimeErrors.PULSE_PRS_425,
  PRS_RELOAD_FAILED: RuntimeErrors.PULSE_PRS_426,
  PRS_SNAPSHOT_FAILED: RuntimeErrors.PULSE_PRS_427,
  PRS_STATE_RESET_FAILED: RuntimeErrors.PULSE_PRS_428,
  PRS_LOGS_UNAVAILABLE: RuntimeErrors.PULSE_PRS_429,

  // Database
  CONNECTION_FAILED: DatabaseErrors.PULSE_DB_300,
  CONNECTION_TIMEOUT: DatabaseErrors.PULSE_DB_301,
  CONNECTION_LOST: DatabaseErrors.PULSE_DB_302,
  POOL_EXHAUSTED: DatabaseErrors.PULSE_DB_303,
  POOL_CLOSED: DatabaseErrors.PULSE_DB_304,
  QUERY_FAILED: DatabaseErrors.PULSE_DB_320,
  QUERY_TIMEOUT: DatabaseErrors.PULSE_DB_321,
  QUERY_SYNTAX_ERROR: DatabaseErrors.PULSE_DB_322,
  QUERY_CONSTRAINT_VIOLATION: DatabaseErrors.PULSE_DB_323,
  QUERY_PERMISSION_DENIED: DatabaseErrors.PULSE_DB_324,
  TRANSACTION_FAILED: DatabaseErrors.PULSE_DB_340,
  TRANSACTION_ALREADY_CLOSED: DatabaseErrors.PULSE_DB_341,
  TRANSACTION_COMMIT_FAILED: DatabaseErrors.PULSE_DB_342,
  TRANSACTION_ROLLBACK_FAILED: DatabaseErrors.PULSE_DB_343,
  TRANSACTION_DEADLOCK: DatabaseErrors.PULSE_DB_344,
  TRANSACTION_SERIALIZATION_FAILURE: DatabaseErrors.PULSE_DB_345,
  DATABASE_ERROR: DatabaseErrors.PULSE_DB_360,
  INVALID_PARAMETER: DatabaseErrors.PULSE_DB_361,
  RESULT_SET_ERROR: DatabaseErrors.PULSE_DB_362,

  // Redis
  REDIS_CONNECTION_FAILED: RedisErrors.PULSE_REDIS_500,
  REDIS_CONNECTION_LOST: RedisErrors.PULSE_REDIS_501,
  REDIS_CONNECTION_TIMEOUT: RedisErrors.PULSE_REDIS_502,
  REDIS_OPERATION_FAILED: RedisErrors.PULSE_REDIS_520,
  REDIS_KEY_NOT_FOUND: RedisErrors.PULSE_REDIS_521,
  REDIS_INVALID_TYPE: RedisErrors.PULSE_REDIS_522,
  REDIS_INVALID_VALUE: RedisErrors.PULSE_REDIS_523,
  REDIS_SUBSCRIBE_FAILED: RedisErrors.PULSE_REDIS_540,
  REDIS_PUBLISH_FAILED: RedisErrors.PULSE_REDIS_541,
  REDIS_CHANNEL_CLOSED: RedisErrors.PULSE_REDIS_542,

  // HTTP
  SERVER_START_FAILED: HttpErrors.PULSE_HTTP_600,
  SERVER_ALREADY_RUNNING: HttpErrors.PULSE_HTTP_601,
  SERVER_NOT_RUNNING: HttpErrors.PULSE_HTTP_602,
  SERVER_SHUTDOWN_FAILED: HttpErrors.PULSE_HTTP_603,
  PORT_IN_USE: HttpErrors.PULSE_HTTP_604,
  REQUEST_HANDLER_ERROR: HttpErrors.PULSE_HTTP_620,
  MIDDLEWARE_ERROR: HttpErrors.PULSE_HTTP_621,
  INVALID_REQUEST: HttpErrors.PULSE_HTTP_622,
  REQUEST_TIMEOUT: HttpErrors.PULSE_HTTP_623,
  FETCH_FAILED: HttpErrors.PULSE_HTTP_640,
  FETCH_TIMEOUT: HttpErrors.PULSE_HTTP_641,
  INVALID_URL: HttpErrors.PULSE_HTTP_642,
  CONNECTION_REFUSED: HttpErrors.PULSE_HTTP_643,
  DNS_LOOKUP_FAILED: HttpErrors.PULSE_HTTP_644,
  ROUTE_NOT_FOUND: HttpErrors.PULSE_HTTP_660,
  METHOD_NOT_ALLOWED: HttpErrors.PULSE_HTTP_661,
  STATIC_FILE_NOT_FOUND: HttpErrors.PULSE_HTTP_662,
  STATIC_FILE_ACCESS_DENIED: HttpErrors.PULSE_HTTP_663,
  CONTEXT_NOT_FOUND: HttpErrors.PULSE_HTTP_680,
  TRANSACTION_ROLLBACK_ERROR: HttpErrors.PULSE_HTTP_681,
  AUTH_FAILED: HttpErrors.PULSE_HTTP_682,
  AUTH_REQUIRED: HttpErrors.PULSE_HTTP_683,
};

/**
 * Error code descriptions
 */
export const ErrorDescriptions = {
  // Runtime - Scheduler
  [ErrorCodes.DEADLOCK_DETECTED]: 'All tasks are blocked on channels and no progress is possible',
  [ErrorCodes.SCHEDULER_ALREADY_RUNNING]: 'Scheduler is already running',
  [ErrorCodes.SCHEDULER_NOT_RUNNING]: 'Scheduler is not running',
  [ErrorCodes.TASK_LIMIT_EXCEEDED]: 'Maximum number of concurrent tasks exceeded',
  [ErrorCodes.INVALID_SLEEP_DURATION]: 'Sleep duration must be a positive number',

  // Runtime - Channels
  [ErrorCodes.SEND_ON_CLOSED_CHANNEL]: 'Cannot send on closed channel',
  [ErrorCodes.RECV_ON_CLOSED_CHANNEL]: 'Cannot receive from closed and empty channel',
  [ErrorCodes.CHANNEL_ALREADY_CLOSED]: 'Channel is already closed',
  [ErrorCodes.INVALID_CHANNEL_CAPACITY]: 'Channel capacity must be a non-negative integer',

  // Runtime - Select
  [ErrorCodes.SELECT_NO_CASES]: 'Select expression must have at least one case',
  [ErrorCodes.SELECT_INVALID_CASE]: 'Invalid select case expression',
  [ErrorCodes.SELECT_MULTIPLE_DEFAULTS]: 'Select expression cannot have multiple default cases',

  // Runtime - Async/Cancellation
  [ErrorCodes.TIMEOUT]: 'Operation timed out',
  [ErrorCodes.ASYNC_ALL_FAILED]: 'One or more async operations failed',
  [ErrorCodes.ASYNC_RACE_FAILED]: 'All async operations in race failed',
  [ErrorCodes.OPERATION_CANCELLED]: 'Operation was cancelled',
  [ErrorCodes.CANCELLATION_FAILED]: 'Failed to cancel operation',

  // Runtime - PulsePromise (M14.4)
  [ErrorCodes.PROMISE_ALREADY_SETTLED]: 'Promise is already settled (resolved or rejected)',
  [ErrorCodes.PROMISE_NOT_REGISTERED]: 'Promise is not registered with scheduler',
  [ErrorCodes.PROMISE_INVALID_STATE]: 'Promise is in an invalid state for this operation',

  // Runtime - AsyncGroup (M14.4)
  [ErrorCodes.ASYNC_GROUP_SETTLED]: 'Cannot spawn task in settled AsyncGroup',
  [ErrorCodes.ASYNC_GROUP_TASK_LIMIT]: 'AsyncGroup task limit exceeded',
  [ErrorCodes.ASYNC_GROUP_CANCELLED]: 'AsyncGroup was cancelled',
  [ErrorCodes.ASYNC_GROUP_WAIT_TWICE]: 'Cannot call wait() twice on AsyncGroup',
  [ErrorCodes.ASYNC_GROUP_FAIL_FAST]: 'AsyncGroup failed fast due to task error',

  // Runtime - Supervisor
  [ErrorCodes.SUPERVISOR_CHILD_FAILED]: 'Supervised child task failed',
  [ErrorCodes.SUPERVISOR_MAX_RESTARTS]: 'Child exceeded maximum restart limit',
  [ErrorCodes.SUPERVISOR_STOPPED]: 'Supervisor is stopped',
  [ErrorCodes.SUPERVISOR_EXHAUSTED]: 'Supervisor restart limit exhausted, propagating to parent',
  [ErrorCodes.SUPERVISOR_CIRCULAR]: 'Circular supervisor hierarchy detected',

  // Runtime - Debugger
  [ErrorCodes.DEBUGGER_NOT_ENABLED]: 'Debugger is not enabled',
  [ErrorCodes.DEBUGGER_ALREADY_PAUSED]: 'Debugger is already paused',
  [ErrorCodes.DEBUGGER_NOT_PAUSED]: 'Debugger is not paused',
  [ErrorCodes.INVALID_BREAKPOINT]: 'Invalid breakpoint location',
  [ErrorCodes.BREAKPOINT_NOT_FOUND]: 'Breakpoint not found',
  [ErrorCodes.INVALID_FRAME_ID]: 'Invalid stack frame ID',
  [ErrorCodes.EVAL_NOT_SUPPORTED]: 'Expression evaluation not supported in deterministic mode',

  // Runtime - Inspector
  [ErrorCodes.INSPECTOR_NOT_ENABLED]: 'Inspector is not enabled',
  [ErrorCodes.TASK_NOT_FOUND]: 'Task not found',
  [ErrorCodes.CHANNEL_NOT_FOUND]: 'Channel not found',
  [ErrorCodes.STATS_NOT_AVAILABLE]: 'Statistics not available',
  [ErrorCodes.SNAPSHOT_TOO_LARGE]: 'Snapshot exceeds resource limits',

  // Package Manager
  [ErrorCodes.PACKAGE_NOT_FOUND]: 'Package not found in registry',
  [ErrorCodes.VERSION_NOT_FOUND]: 'Package version not found',
  [ErrorCodes.REGISTRY_UNAVAILABLE]: 'Package registry is unavailable',
  [ErrorCodes.CHECKSUM_MISMATCH]: 'Package checksum verification failed',
  [ErrorCodes.LOCKFILE_CONFLICT]: 'Lockfile conflict detected',
  [ErrorCodes.INSTALL_FAILED]: 'Package installation failed',
  [ErrorCodes.INVALID_MANIFEST]: 'Invalid package manifest',
  [ErrorCodes.PACKAGE_CORRUPT]: 'Package file is corrupt',
  [ErrorCodes.DEPENDENCY_CONFLICT]: 'Dependency version conflict',

  // Pulse Runtime Server (PRS)
  [ErrorCodes.PRS_NOT_INITIALIZED]: 'PRS is not initialized',
  [ErrorCodes.PRS_PROJECT_NOT_LOADED]: 'No project loaded in PRS',
  [ErrorCodes.PRS_PROJECT_LOAD_FAILED]: 'Failed to load project',
  [ErrorCodes.PRS_ENTRY_NOT_FOUND]: 'Entry point not found in project',
  [ErrorCodes.PRS_EXECUTION_FAILED]: 'Project execution failed',
  [ErrorCodes.PRS_INVALID_REQUEST]: 'Invalid PRS API request',
  [ErrorCodes.PRS_RELOAD_FAILED]: 'Failed to reload project',
  [ErrorCodes.PRS_SNAPSHOT_FAILED]: 'Failed to get runtime snapshot',
  [ErrorCodes.PRS_STATE_RESET_FAILED]: 'Failed to reset runtime state',
  [ErrorCodes.PRS_LOGS_UNAVAILABLE]: 'Logs are not available',

  // Database - Connection
  [ErrorCodes.CONNECTION_FAILED]: 'Failed to connect to database',
  [ErrorCodes.CONNECTION_TIMEOUT]: 'Database connection timeout',
  [ErrorCodes.CONNECTION_LOST]: 'Database connection lost',
  [ErrorCodes.POOL_EXHAUSTED]: 'Connection pool exhausted - no available connections',
  [ErrorCodes.POOL_CLOSED]: 'Connection pool is closed',

  // Database - Query
  [ErrorCodes.QUERY_FAILED]: 'Database query failed',
  [ErrorCodes.QUERY_TIMEOUT]: 'Query execution timeout',
  [ErrorCodes.QUERY_SYNTAX_ERROR]: 'SQL syntax error',
  [ErrorCodes.QUERY_CONSTRAINT_VIOLATION]: 'Database constraint violation',
  [ErrorCodes.QUERY_PERMISSION_DENIED]: 'Permission denied for query',

  // Database - Transaction
  [ErrorCodes.TRANSACTION_FAILED]: 'Transaction failed',
  [ErrorCodes.TRANSACTION_ALREADY_CLOSED]: 'Transaction is already committed or rolled back',
  [ErrorCodes.TRANSACTION_COMMIT_FAILED]: 'Transaction commit failed',
  [ErrorCodes.TRANSACTION_ROLLBACK_FAILED]: 'Transaction rollback failed',
  [ErrorCodes.TRANSACTION_DEADLOCK]: 'Transaction deadlock detected',
  [ErrorCodes.TRANSACTION_SERIALIZATION_FAILURE]: 'Transaction serialization failure',

  // Database - Generic
  [ErrorCodes.DATABASE_ERROR]: 'Database error',
  [ErrorCodes.INVALID_PARAMETER]: 'Invalid parameter',
  [ErrorCodes.RESULT_SET_ERROR]: 'Error processing result set',

  // Redis - Connection
  [ErrorCodes.REDIS_CONNECTION_FAILED]: 'Failed to connect to Redis',
  [ErrorCodes.REDIS_CONNECTION_LOST]: 'Redis connection lost',
  [ErrorCodes.REDIS_CONNECTION_TIMEOUT]: 'Redis connection timeout',

  // Redis - Operations
  [ErrorCodes.REDIS_OPERATION_FAILED]: 'Redis operation failed',
  [ErrorCodes.REDIS_KEY_NOT_FOUND]: 'Redis key not found',
  [ErrorCodes.REDIS_INVALID_TYPE]: 'Invalid type for Redis operation',
  [ErrorCodes.REDIS_INVALID_VALUE]: 'Invalid value for Redis operation',

  // Redis - Pub/Sub
  [ErrorCodes.REDIS_SUBSCRIBE_FAILED]: 'Redis subscribe failed',
  [ErrorCodes.REDIS_PUBLISH_FAILED]: 'Redis publish failed',
  [ErrorCodes.REDIS_CHANNEL_CLOSED]: 'Redis channel closed',

  // HTTP - Server
  [ErrorCodes.SERVER_START_FAILED]: 'Failed to start HTTP server',
  [ErrorCodes.SERVER_ALREADY_RUNNING]: 'HTTP server is already running',
  [ErrorCodes.SERVER_NOT_RUNNING]: 'HTTP server is not running',
  [ErrorCodes.SERVER_SHUTDOWN_FAILED]: 'Failed to shutdown HTTP server',
  [ErrorCodes.PORT_IN_USE]: 'Port is already in use',

  // HTTP - Request Handling
  [ErrorCodes.REQUEST_HANDLER_ERROR]: 'Request handler error',
  [ErrorCodes.MIDDLEWARE_ERROR]: 'Middleware error',
  [ErrorCodes.INVALID_REQUEST]: 'Invalid HTTP request',
  [ErrorCodes.REQUEST_TIMEOUT]: 'Request timeout',

  // HTTP - Client
  [ErrorCodes.FETCH_FAILED]: 'HTTP fetch failed',
  [ErrorCodes.FETCH_TIMEOUT]: 'HTTP fetch timeout',
  [ErrorCodes.INVALID_URL]: 'Invalid URL',
  [ErrorCodes.CONNECTION_REFUSED]: 'Connection refused',
  [ErrorCodes.DNS_LOOKUP_FAILED]: 'DNS lookup failed',

  // HTTP - Routing
  [ErrorCodes.ROUTE_NOT_FOUND]: 'Route not found',
  [ErrorCodes.METHOD_NOT_ALLOWED]: 'HTTP method not allowed',
  [ErrorCodes.STATIC_FILE_NOT_FOUND]: 'Static file not found',
  [ErrorCodes.STATIC_FILE_ACCESS_DENIED]: 'Static file access denied',

  // HTTP - Context
  [ErrorCodes.CONTEXT_NOT_FOUND]: 'Request context not found',
  [ErrorCodes.TRANSACTION_ROLLBACK_ERROR]: 'Transaction rollback error',
  [ErrorCodes.AUTH_FAILED]: 'Authentication failed',
  [ErrorCodes.AUTH_REQUIRED]: 'Authentication required',
};

/**
 * Create a standardized error result
 *
 * @param {string} code - Error code from ErrorCodes
 * @param {string} message - Custom error message (optional, uses description if not provided)
 * @param {Object} extra - Additional error fields (optional)
 * @returns {Object} Error result {ok: false, code, error, ...extra}
 */
export function createError(code, message, extra = {}) {
  return {
    ok: false,
    code,
    error: message || ErrorDescriptions[code] || 'Unknown error',
    ...extra
  };
}

/**
 * Check if a result is an error
 *
 * @param {Object} result - Result object
 * @returns {boolean} True if result represents an error
 */
export function isError(result) {
  return !!(result && result.ok === false);
}

/**
 * Check if an error has a specific code
 *
 * @param {Object} result - Result object
 * @param {string} code - Error code to check
 * @returns {boolean} True if error has the specified code
 */
export function hasErrorCode(result, code) {
  return isError(result) && result.code === code;
}

/**
 * Get error description by code
 *
 * @param {string} code - Error code
 * @returns {string} Error description
 */
export function getErrorDescription(code) {
  return ErrorDescriptions[code] || 'Unknown error code';
}
