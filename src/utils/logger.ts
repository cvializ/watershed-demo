import pino from "pino";

/**
 * Create a logger instance with default configuration
 */
export const createLogger = (): pino.Logger => {
  return pino({
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
  });
};

/**
 * Default logger instance
 */
export const logger = createLogger();
