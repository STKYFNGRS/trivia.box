import { logger } from './logger';

/**
 * Type for message data to avoid using any
 */
export interface MessageData {
  type: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Utility to handle message channel communications with proper timeouts
 */
export class MessageChannelHandler {
  private timeoutMs: number;
  
  constructor(timeoutMs = 10000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Sends a message with timeout protection
   */
  async sendMessage(target: MessagePort | Window | Worker, message: MessageData): Promise<unknown> {
    return new Promise((resolve, reject) => {
      // Create timeout to avoid hanging promises
      const timeoutId = setTimeout(() => {
        logger.warn(`MessageChannelHandler: Message response timeout after ${this.timeoutMs}ms`);
        reject(new Error('Message response timeout'));
      }, this.timeoutMs);
      
      // Setup one-time message handler
      const responseHandler = (event: MessageEvent): void => {
        clearTimeout(timeoutId);
        
        if (target instanceof MessagePort || target instanceof Worker) {
          target.removeEventListener('message', responseHandler);
        } else {
          window.removeEventListener('message', responseHandler);
        }
        
        resolve(event.data);
      };
      
      // Add listener
      if (target instanceof MessagePort || target instanceof Worker) {
        target.addEventListener('message', responseHandler);
      } else {
        window.addEventListener('message', responseHandler);
      }
      
      // Send message
      try {
        if (target instanceof Window) {
          target.postMessage(message, '*'); // Use * for cross-origin support
        } else {
          target.postMessage(message);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
}

/**
 * Creates a wrapped postMessage function that ensures responses
 * are properly handled or timed out
 */
export function createSafeMessageSender(target: MessagePort | Window | Worker, timeoutMs = 10000) {
  const handler = new MessageChannelHandler(timeoutMs);
  
  return (message: MessageData): Promise<unknown> => {
    return handler.sendMessage(target, message).catch(err => {
      logger.warn(`SafeMessageSender: Error sending message: ${err instanceof Error ? err.message : String(err)}`);
      // Return null instead of rejecting to prevent uncaught promise errors
      return null;
    });
  };
}