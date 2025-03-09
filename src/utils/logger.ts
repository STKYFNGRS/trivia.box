'use client';

/**
 * Advanced Logger utility with environment-aware logging
 * 
 * Only logs in development mode by default, allowing for cleaner
 * production logs while maintaining debugging capability.
 */

// Helper to determine current environment
const isDevEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         window.location.hostname.includes('staging') ||
         (window as any).__DEV_MODE__ === true;
};

// Create log levels
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
  // If true, logs in production as well (use sparingly)
  force?: boolean;
  // Component or module name for better categorization
  component?: string;
  // Additional metadata to include
  meta?: Record<string, any>;
}

/**
 * Logger class with environment awareness and structured logging
 */
class Logger {
  private static _instance: Logger;
  
  // Flag to completely disable all logging (can be toggled at runtime)
  private _disabled: boolean = false;
  
  // Whether we're in development mode - cached to avoid repeated checks
  private _isDev: boolean;
  
  private constructor() {
    this._isDev = isDevEnvironment();
    
    // Listen for any debug mode toggling events
    if (typeof window !== 'undefined') {
      window.addEventListener('toggleDebugMode', (event: any) => {
        if (event.detail?.enabled !== undefined) {
          (window as any).__DEV_MODE__ = event.detail.enabled;
          this._isDev = isDevEnvironment();
        }
      });
    }
  }
  
  public static getInstance(): Logger {
    if (!Logger._instance) {
      Logger._instance = new Logger();
    }
    return Logger._instance;
  }
  
  /**
   * Internal log method that implements the environment-aware logic
   */
  private _log(level: LogLevel, message: any, options: LogOptions = {}): void {
    // Skip logging if explicitly disabled
    if (this._disabled) return;
    
    // In production, only log errors by default and forced logs
    const shouldLog = this._isDev || level === 'error' || options.force === true;
    if (!shouldLog) return;
    
    // Format the log prefix
    const prefix = options.component ? `[${options.component}]` : '';
    
    // Select the appropriate console method
    const logMethod = console[level] || console.log;
    
    // For simple strings, include prefix
    if (typeof message === 'string') {
      logMethod(`${prefix} ${message}`);
    } 
    // For complex objects, log the prefix and then the object separately
    else {
      if (prefix) logMethod(prefix);
      logMethod(message);
    }
    
    // Log additional metadata if provided
    if (options.meta && Object.keys(options.meta).length > 0) {
      console.log('Additional data:', options.meta);
    }
  }
  
  /**
   * Debug level logging - only appears in development
   */
  public debug(message: any, options: LogOptions = {}): void {
    this._log('debug', message, options);
  }
  
  /**
   * Info level logging - only appears in development
   */
  public info(message: any, options: LogOptions = {}): void {
    this._log('info', message, options);
  }
  
  /**
   * Warning level logging - only appears in development
   */
  public warn(message: any, options: LogOptions = {}): void {
    this._log('warn', message, options);
  }
  
  /**
   * Error level logging - appears in all environments
   */
  public error(message: any, options: LogOptions = {}): void {
    this._log('error', message, options);
  }
  
  /**
   * Disable all logging (useful for testing)
   */
  public disable(): void {
    this._disabled = true;
  }
  
  /**
   * Enable logging after it was disabled
   */
  public enable(): void {
    this._disabled = false;
  }
}

// Export a singleton instance
export const logger = Logger.getInstance();

// Export convenience functions
export const log = {
  debug: (message: any, options: LogOptions = {}) => logger.debug(message, options),
  info: (message: any, options: LogOptions = {}) => logger.info(message, options),
  warn: (message: any, options: LogOptions = {}) => logger.warn(message, options),
  error: (message: any, options: LogOptions = {}) => logger.error(message, options)
};

export default logger;
