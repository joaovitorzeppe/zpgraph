import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Zgraph } from '../src/index';
import type { Annotation, ZgraphOptions } from '../src/types';
import { mockCanvas, mountDiv, sampleData } from './helpers';

const base: ZgraphOptions = {
  labels: ['x', 'A', 'B'],
  width: 480,
  height: 320,
};

const makeChart = (options: ZgraphOptions = {}) => {
  const el = mountDiv();
  const g = new Zgraph(el, sampleData, { ...base, ...options });
  return { el, g };
};

const nodes = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('.zgraph-annotation'));

describe('Annotations plugin', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockCanvas();
  });

  it('renders one div per annotation with its short text', () => {
    const { el, g } = makeChart();

    g.setAnnotations([
      { series: 'A', x: 2, shortText: 'a1', text: 'primeira' },
      { series: 'B', x: 3, shortText: 'b1', text: 'segunda' },
    ]);

    const rendered = nodes(el);
    expect(rendered).toHaveLength(2);
    expect(rendered.map((n) => n.textContent)).toEqual(['a1', 'b1']);
    expect(rendered.map((n) => n.title)).toEqual(['primeira', 'segunda']);
    // No icon, so each falls back to the default text annotation.
    expect(
      rendered.every((n) => n.className.includes('zgraph-default-annotation')),
    ).toBe(true);

    g.destroy();
  });

  it('returns the annotations that were set', () => {
    const { g } = makeChart();
    const ann: Annotation[] = [{ series: 'A', x: 2, shortText: 'a1' }];

    g.setAnnotations(ann);

    expect(g.annotations()).toEqual(ann);

    g.destroy();
  });

  it('starts with no annotations at all', () => {
    const { el, g } = makeChart();

    expect(g.annotations()).toEqual([]);
    expect(nodes(el)).toHaveLength(0);

    g.destroy();
  });

  it('replaces the rendered divs when the list is set again', () => {
    const { el, g } = makeChart();
    g.setAnnotations([{ series: 'A', x: 2, shortText: 'a1' }]);
    expect(nodes(el)).toHaveLength(1);

    g.setAnnotations([{ series: 'A', x: 3, shortText: 'a2' }]);
    expect(nodes(el).map((n) => n.textContent)).toEqual(['a2']);

    g.setAnnotations([]);
    expect(nodes(el)).toHaveLength(0);

    g.destroy();
  });

  it('sizes and colours the div from the annotation and the series', () => {
    const { el, g } = makeChart({ series: { A: { color: 'rgb(1, 2, 3)' } } });

    g.setAnnotations([
      { series: 'A', x: 2, shortText: 'a1', width: 30, height: 20 },
    ]);

    const node = nodes(el)[0]!;
    expect(node.style.width).toBe('30px');
    expect(node.style.height).toBe('20px');
    expect(node.style.color).toBe('rgb(1, 2, 3)');
    expect(node.style.borderColor).toBe('rgb(1, 2, 3)');
    expect(node.style.position).toBe('');

    g.destroy();
  });

  it('pins the div to the bottom of the plot area with attachAtBottom', () => {
    const { el, g } = makeChart();

    g.setAnnotations([
      { series: 'A', x: 2, shortText: 'a1', height: 20, tickHeight: 6 },
      {
        series: 'A',
        x: 3,
        shortText: 'a2',
        height: 20,
        tickHeight: 6,
        attachAtBottom: true,
      },
    ]);

    const area = g.getArea();
    const [floating, pinned] = nodes(el) as [HTMLElement, HTMLElement];
    expect(parseFloat(pinned.style.top)).toBe(area.y + area.h - 20 - 6);
    expect(parseFloat(floating.style.top)).toBeLessThan(
      parseFloat(pinned.style.top),
    );

    g.destroy();
  });

  it('fires the per-annotation clickHandler', () => {
    const { el, g } = makeChart();
    const clickHandler = vi.fn();

    g.setAnnotations([{ series: 'A', x: 2, shortText: 'a1', clickHandler }]);
    nodes(el)[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clickHandler).toHaveBeenCalledTimes(1);
    const [annotation, point, graph, event] = clickHandler.mock.calls[0]!;
    expect(annotation.shortText).toBe('a1');
    expect(point.name).toBe('A');
    expect(graph).toBe(g);
    expect(event).toBeInstanceOf(MouseEvent);

    g.destroy();
  });

  it('falls back to the chart-wide annotationClickHandler', () => {
    const annotationClickHandler = vi.fn();
    const { el, g } = makeChart({ annotationClickHandler });

    g.setAnnotations([{ series: 'A', x: 2, shortText: 'a1' }]);
    nodes(el)[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(annotationClickHandler).toHaveBeenCalledTimes(1);

    g.destroy();
  });

  it('prefers the per-annotation handler over the chart-wide one', () => {
    const annotationClickHandler = vi.fn();
    const clickHandler = vi.fn();
    const { el, g } = makeChart({ annotationClickHandler });

    g.setAnnotations([{ series: 'A', x: 2, shortText: 'a1', clickHandler }]);
    nodes(el)[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clickHandler).toHaveBeenCalledTimes(1);
    expect(annotationClickHandler).not.toHaveBeenCalled();

    g.destroy();
  });

  it('wires mouseover, mouseout and dblclick as well', () => {
    const mouseOverHandler = vi.fn();
    const mouseOutHandler = vi.fn();
    const dblClickHandler = vi.fn();
    const { el, g } = makeChart();

    g.setAnnotations([
      {
        series: 'A',
        x: 2,
        shortText: 'a1',
        mouseOverHandler,
        mouseOutHandler,
        dblClickHandler,
      },
    ]);

    const node = nodes(el)[0]!;
    node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    node.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(mouseOverHandler).toHaveBeenCalledTimes(1);
    expect(mouseOutHandler).toHaveBeenCalledTimes(1);
    expect(dblClickHandler).toHaveBeenCalledTimes(1);

    g.destroy();
  });

  it('keeps rendering with displayAnnotations set to false', () => {
    // displayAnnotations only tells the Gviz parser to read string columns as
    // annotations; it is not a switch for annotations set through the API.
    const { el, g } = makeChart({ displayAnnotations: false });

    g.setAnnotations([{ series: 'A', x: 2, shortText: 'a1' }]);

    expect(nodes(el)).toHaveLength(1);

    g.destroy();
  });

  it('draws the tick line into the chart context', () => {
    const { g } = makeChart();
    const ctx = (
      g as unknown as {
        hidden_ctx_: Record<'stroke', ReturnType<typeof vi.fn>>;
      }
    ).hidden_ctx_;
    const strokesBefore = ctx.stroke.mock.calls.length;

    g.setAnnotations([{ series: 'A', x: 2, shortText: 'a1' }]);

    expect(ctx.stroke.mock.calls.length).toBeGreaterThan(strokesBefore);

    g.destroy();
  });

  it('detaches every annotation div on destroy', () => {
    const { el, g } = makeChart();
    g.setAnnotations([{ series: 'A', x: 2, shortText: 'a1' }]);
    expect(nodes(el)).toHaveLength(1);

    g.destroy();

    expect(nodes(el)).toHaveLength(0);
  });
});
