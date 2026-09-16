/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: string;
  }
}
declare const process: { env: NodeJS.ProcessEnv };

declare module '*.css' {
  const cssText: string;
  export default cssText;
}
