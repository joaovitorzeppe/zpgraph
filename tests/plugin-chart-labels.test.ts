import { beforeEach, describe, expect, it } from 'vitest';
import { Zgraph } from '../src/index';
import type { ZgraphOptions } from '../src/types';
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

describe('ChartLabels plugin', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockCanvas();
  });

  it('creates a title div and reserves space at the top for it', () => {
    const { el, g } = makeChart({ title: 'Vendas' });

    const title = el.querySelector('.zgraph-title')!;
    expect(title).not.toBeNull();
    expect(title.textContent).toBe('Vendas');
    expect(title.classList.contains('zgraph-label')).toBe(true);
    // titleHeight defaults to 28, so the plot area starts below it.
    expect(g.getArea().y).toBeGreaterThanOrEqual(28);

    g.destroy();
  });

  it('creates an xlabel div at the bottom', () => {
    const { el, g } = makeChart({ xlabel: 'Tempo' });

    const xlabel = el.querySelector('.zgraph-xlabel')!;
    expect(xlabel.textContent).toBe('Tempo');
    const box = xlabel.parentElement!;
    expect(box.style.position).toBe('absolute');
    expect(parseFloat(box.style.height)).toBe(18);

    g.destroy();
  });

  it('creates a rotated ylabel div for the left axis', () => {
    const { el, g } = makeChart({ ylabel: 'Valor' });

    const ylabel = el.querySelector('.zgraph-ylabel')!;
    expect(ylabel.textContent).toBe('Valor');
    expect(ylabel.parentElement!.className).toBe('zgraph-label-rotate-right');

    g.destroy();
  });

  it('creates a y2label div only when there is a second axis', () => {
    const { el, g } = makeChart({ y2label: 'Outro' });
    expect(el.querySelector('.zgraph-y2label')).toBeNull();
    g.destroy();

    const second = makeChart({
      y2label: 'Outro',
      series: { B: { axis: 'y2' } },
    });
    const y2label = second.el.querySelector('.zgraph-y2label')!;
    expect(y2label.textContent).toBe('Outro');
    expect(y2label.parentElement!.className).toBe('zgraph-label-rotate-left');
    second.g.destroy();
  });

  it('creates all four labels at once without interfering', () => {
    const { el, g } = makeChart({
      title: 'T',
      xlabel: 'X',
      ylabel: 'Y',
      y2label: 'Y2',
      series: { B: { axis: 'y2' } },
    });

    expect(el.querySelector('.zgraph-title')!.textContent).toBe('T');
    expect(el.querySelector('.zgraph-xlabel')!.textContent).toBe('X');
    expect(el.querySelector('.zgraph-ylabel')!.textContent).toBe('Y');
    expect(el.querySelector('.zgraph-y2label')!.textContent).toBe('Y2');
    expect(el.querySelectorAll('.zgraph-label')).toHaveLength(4);

    g.destroy();
  });

  it('updates the text in place when an option changes', () => {
    const { el, g } = makeChart({ title: 'Antes', xlabel: 'X1', ylabel: 'Y1' });

    g.updateOptions({ title: 'Depois', xlabel: 'X2', ylabel: 'Y2' });

    expect(el.querySelector('.zgraph-title')!.textContent).toBe('Depois');
    expect(el.querySelector('.zgraph-xlabel')!.textContent).toBe('X2');
    expect(el.querySelector('.zgraph-ylabel')!.textContent).toBe('Y2');
    expect(el.querySelectorAll('.zgraph-title')).toHaveLength(1);

    g.destroy();
  });

  it('removes the divs when the options are cleared via updateOptions', () => {
    const { el, g } = makeChart({
      title: 'T',
      xlabel: 'X',
      ylabel: 'Y',
      y2label: 'Y2',
      series: { B: { axis: 'y2' } },
    });
    expect(el.querySelectorAll('.zgraph-label')).toHaveLength(4);

    g.updateOptions({ title: '', xlabel: '', ylabel: '', y2label: '' });

    expect(el.querySelector('.zgraph-title')).toBeNull();
    expect(el.querySelector('.zgraph-xlabel')).toBeNull();
    expect(el.querySelector('.zgraph-ylabel')).toBeNull();
    expect(el.querySelector('.zgraph-y2label')).toBeNull();
    expect(el.querySelectorAll('.zgraph-label')).toHaveLength(0);

    g.destroy();
  });

  it('adds a label that was missing at construction time', () => {
    const { el, g } = makeChart();
    expect(el.querySelector('.zgraph-title')).toBeNull();

    g.updateOptions({ title: 'Novo' });

    expect(el.querySelector('.zgraph-title')!.textContent).toBe('Novo');

    g.destroy();
  });

  it('gives the plot area back when a label is removed', () => {
    const { g } = makeChart({ title: 'T' });
    const withTitle = g.getArea().h;

    g.updateOptions({ title: '' });

    expect(g.getArea().h).toBeGreaterThan(withTitle);

    g.destroy();
  });

  it('detaches every label on destroy', () => {
    const { el, g } = makeChart({ title: 'T', xlabel: 'X', ylabel: 'Y' });
    expect(el.querySelectorAll('.zgraph-label')).toHaveLength(3);

    g.destroy();

    expect(el.querySelectorAll('.zgraph-label')).toHaveLength(0);
  });
});
