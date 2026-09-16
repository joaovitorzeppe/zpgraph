import { describe, expect, it, vi } from "vitest";
import { Zpgraph } from "../src/index";
import { mockCanvas, mountDiv, sampleData } from "./helpers";

const chart = () => {
  mockCanvas();
  return new Zpgraph(mountDiv(), sampleData, { labels: ["x", "a", "b"] });
};

describe("entrada inválida falha na fronteira, não lá dentro", () => {
  it("rejeita dados de tipo não suportado", () => {
    mockCanvas();
    expect(
      () => new Zpgraph(mountDiv(), 42 as never, { labels: ["x", "a"] }),
    ).toThrow(/unsupported data/);
  });

  it("updateOptions exige um objeto de opções", () => {
    const g = chart();
    expect(() => g.updateOptions([{ title: "x" }] as never)).toThrow(TypeError);
    expect(() => g.updateOptions(null as never)).toThrow(TypeError);
    expect(() => g.updateOptions({ title: "ok" })).not.toThrow();
  });

  it("setAnnotations exige um array", () => {
    const g = chart();
    expect(() => g.setAnnotations({ series: "a", x: 1 } as never)).toThrow(
      TypeError,
    );
  });

  it("uma anotação inválida não descarta as seguintes", () => {
    const g = chart();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    g.setAnnotations([
      { series: "a", x: 1, shortText: "ok" },
      { series: "a", shortText: "sem x" },
      { series: "a", x: 3, shortText: "também ok" },
    ] as never);

    const kept = (g as unknown as { layout_: { annotations: unknown[] } })
      .layout_.annotations;
    expect(kept).toHaveLength(2);
    expect(err).toHaveBeenCalledOnce();
    err.mockRestore();
  });

  it("rejeita labels de série duplicados", () => {
    mockCanvas();
    expect(
      () =>
        new Zpgraph(mountDiv(), sampleData, {
          labels: ["x", "a", "a"],
        }),
    ).toThrow(/Duplicate series label "a"/);
  });

  it("opção desconhecida é recusada mesmo fora de modo debug", () => {
    mockCanvas();
    expect(
      () =>
        new Zpgraph(mountDiv(), sampleData, {
          labels: ["x", "a", "b"],
          notAnOption: 1,
        } as never),
    ).toThrow(/invalid option notAnOption/);
  });
});
