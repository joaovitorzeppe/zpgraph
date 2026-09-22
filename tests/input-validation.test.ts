import { describe, expect, it, vi } from "vitest";
import { Zpgraph } from "../src/index";
import {
  callLoose,
  constructLoose,
  mockCanvas,
  mountDiv,
  sampleData,
} from "./helpers";

const chart = () => {
  mockCanvas();
  return new Zpgraph(mountDiv(), sampleData, { labels: ["x", "a", "b"] });
};

describe("entrada inválida falha na fronteira, não lá dentro", () => {
  it("rejeita dados de tipo não suportado", () => {
    mockCanvas();
    expect(() =>
      constructLoose(mountDiv(), 42, { labels: ["x", "a"] }),
    ).toThrow(/unsupported data/);
  });

  it("updateOptions exige um objeto de opções", () => {
    const g = chart();
    expect(() => callLoose(g.updateOptions, g, [[{ title: "x" }]])).toThrow(
      TypeError,
    );
    expect(() => callLoose(g.updateOptions, g, [null])).toThrow(TypeError);
    expect(() => g.updateOptions({ title: "ok" })).not.toThrow();
  });

  it("setAnnotations exige um array", () => {
    const g = chart();
    expect(() =>
      callLoose(g.setAnnotations, g, [{ series: "a", x: 1 }]),
    ).toThrow(TypeError);
  });

  it("uma anotação inválida não descarta as seguintes", () => {
    const g = chart();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    callLoose(g.setAnnotations, g, [
      [
        { series: "a", x: 1, shortText: "ok" },
        { series: "a", shortText: "sem x" },
        { series: "a", x: 3, shortText: "também ok" },
      ],
    ]);

    expect(g.layout_.annotations).toHaveLength(2);
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
    expect(() =>
      constructLoose(mountDiv(), sampleData, {
        labels: ["x", "a", "b"],
        notAnOption: 1,
      }),
    ).toThrow(/invalid option notAnOption/);
  });
});
