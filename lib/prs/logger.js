/**
 * PRS Logger
 *
 * Structured logging for Pulse Runtime Server with determinism support.
 * Maintains in-memory log buffer with clear separation of logical vs wall-clock time.
 */

/**
 * Log levels
 */
const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

/**
 * PRSLogger provides structured logging with in-memory buffer
 */
class PRSLogger {
  /**
   * Create a new logger instance
   * @param {Object} options - Logger options
   * @param {number} options.maxEntries - Maximum log entries to keep (default: 1000)
   * @param {Function} options.getLogicalTime - Function to get current logical time (optional)
   */
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 1000;
    this.getLogicalTime = options.getLogicalTime || null;
    this.entries = [];
    this.totalEntries = 0;
  }

  /**
   * Log an entry
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   */
  log(level, message, context = {}) {
    const entry = {
      id: this.totalEntries++,
      timestamp: {
        wallClock: Date.now(),
        logical: this.getLogicalTime ? this.getLogicalTime() : null
      },
      level,
      message,
      context
    };

    this.entries.push(entry);

    // Trim buffer if exceeds max entries
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    return entry;
  }

  /**
   * Log debug message
   */
  debug(message, context = {}) {
    return this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info message
   */
  info(message, context = {}) {
    return this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message
   */
  warn(message, context = {}) {
    return this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error message
   */
  error(message, context = {}) {
    return this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Get log entries with limit and offset
   * @param {number} limit - Maximum number of entries to return
   * @param {number} offset - Number of entries to skip from start
   * @returns {Array} Log entries
   */
  getLogs(limit = 100, offset = 0) {
    const start = Math.max(0, offset);
    const end = Math.min(this.entries.length, start + limit);
    return this.entries.slice(start, end);
  }

  /**
   * Get last N log entries
   * @param {number} n - Number of entries to return
   * @returns {Array} Last N log entries
   */
  getLastN(n = 100) {
    const start = Math.max(0, this.entries.length - n);
    return this.entries.slice(start);
  }

  /**
   * Get all log entries
   * @returns {Array} All log entries
   */
  getAll() {
    return [...this.entries];
  }

  /**
   * Get log entries by level
   * @param {string} level - Log level to filter
   * @returns {Array} Filtered log entries
   */
  getByLevel(level) {
    return this.entries.filter(entry => entry.level === level);
  }

  /**
   * Get log entries since a specific wall-clock timestamp
   * @param {number} timestamp - Wall-clock timestamp
   * @returns {Array} Filtered log entries
   */
  getSince(timestamp) {
    return this.entries.filter(entry => entry.timestamp.wallClock >= timestamp);
  }

  /**
   * Get log entries for a specific logical time range
   * @param {number} startTime - Start logical time
   * @param {number} endTime - End logical time
   * @returns {Array} Filtered log entries
   */
  getLogicalTimeRange(startTime, endTime) {
    return this.entries.filter(entry => {
      const t = entry.timestamp.logical;
      return t !== null && t >= startTime && t <= endTime;
    });
  }

  /**
   * Clear all log entries
   */
  clear() {
    this.entries = [];
    this.totalEntries = 0;
  }

  /**
   * Get logger statistics
   * @returns {Object} Logger stats
   */
  getStats() {
    const stats = {
      totalEntries: this.totalEntries,
      currentEntries: this.entries.length,
      maxEntries: this.maxEntries,
      byLevel: {
        [LogLevel.DEBUG]: 0,
        [LogLevel.INFO]: 0,
        [LogLevel.WARN]: 0,
        [LogLevel.ERROR]: 0
      }
    };

    for (const entry of this.entries) {
      stats.byLevel[entry.level]++;
    }

    return stats;
  }

  /**
   * Serialize logs to JSON-safe format for API responses
   * @param {Array} entries - Log entries to serialize (optional, defaults to all)
   * @returns {Array} Serialized log entries
   */
  serialize(entries = null) {
    const logsToSerialize = entries || this.entries;
    return logsToSerialize.map(entry => ({
      id: entry.id,
      timestamp: {
        wallClock: entry.timestamp.wallClock,
        wallClockISO: new Date(entry.timestamp.wallClock).toISOString(),
        logical: entry.timestamp.logical
      },
      level: entry.level,
      message: entry.message,
      context: entry.context
    }));
  }
}

export {
  PRSLogger,
  LogLevel
};
