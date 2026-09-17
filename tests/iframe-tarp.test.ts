import { beforeEach, describe, expect, it } from "vitest";
import IFrameTarp from "../src/iframe-tarp";
import { stubLayoutMetrics } from "./helpers";

describe("IFrameTarp", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("covers iframes with transparent divs and removes them on uncover", () => {
    const iframe = document.createElement("iframe");
    stubLayoutMetrics(iframe, { width: 200, height: 100, left: 10, top: 20 });
    document.body.appendChild(iframe);

    const tarper = new IFrameTarp();
    tarper.cover();

    expect(tarper.tarps).toHaveLength(1);
    const tarp = tarper.tarps[0]!;
    expect(tarp.parentElement).toBe(document.body);
    expect(tarp.style.width).toBe("200px");
    expect(tarp.style.height).toBe("100px");
    expect(tarp.style.zIndex).toBe("999");

    tarper.uncover();

    expect(tarper.tarps).toHaveLength(0);
    expect(document.body.contains(tarp)).toBe(false);
    expect(document.body.querySelectorAll("iframe")).toHaveLength(1);
  });
});
