import pino from "pino";

/**
 * Default logger instance
 */
export const logger = pino({
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});
