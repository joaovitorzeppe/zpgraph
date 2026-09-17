import { describe, expect, it } from "vitest";
import type { ZpgraphOptions } from "../src/types";

/**
 * ZpgraphOptions has no index signature, so a misspelled option is a compile
 * error rather than a silently ignored key. `tsc --noEmit` covers tests/, so
 * the @ts-expect-error lines below fail the typecheck if the signature ever
 * comes back.
 */
describe("ZpgraphOptions rejects unknown keys at compile time", () => {
  it("accepts documented options", () => {
    const opts = {
      labels: ["x", "A"],
      strokeWidth: 2,
      tooltip: { show: "always" },
      axes: { y: { valueRange: [0, 10] } },
      series: { A: { color: "#f00" } },
      rangeSelectorAlpha: 0.5,
      annotationClickHandler: () => {},
    } satisfies ZpgraphOptions;

    expect(opts.labels).toEqual(["x", "A"]);
  });

  it("rejects a typo", () => {
    const opts: ZpgraphOptions = {
      // @ts-expect-error strokeWidht is not an option
      strokeWidht: 2,
    };
    expect(opts).toBeDefined();
  });

  it("rejects an option that does not exist at all", () => {
    const opts: ZpgraphOptions = {
      // @ts-expect-error there is no such option
      nonsenseOption: true,
    };
    expect(opts).toBeDefined();
  });
});
