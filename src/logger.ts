/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

/**
 * Where Zgraph writes its diagnostics. Defaults to the console; swap it out
 * with `setLogger` to route warnings into your own reporting, or silence them.
 */
export interface Logger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const consoleLogger: Logger = {
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

let current: Logger = consoleLogger;

/** Replaces the logger. Passing null (or nothing) restores the console. */
export const setLogger = (logger?: Logger | null): void => {
  current = logger ?? consoleLogger;
};

/** The logger in use. Always read through this object, never cache a method. */
export const log: Logger = {
  log: (...args) => current.log(...args),
  warn: (...args) => current.warn(...args),
  error: (...args) => current.error(...args),
};
