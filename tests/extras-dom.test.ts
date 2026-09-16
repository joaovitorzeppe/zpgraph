import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  drag,
  fillTemplate,
  makeEmitter,
  toggle,
} from '../src/extras/dom-helpers';

/**
 * These helpers replace the jQuery and jQuery UI calls the extras used to make.
 * The template filling is also the fix for the injection that Wave 1 left open:
 * annotation text used to be spliced into markup.
 */

describe('fillTemplate', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const template = (html: string) => {
    const el = document.createElement('div');
    el.id = 'a-template';
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  };

  it('substitutes placeholders inside text', () => {
    const filled = fillTemplate(template('<span>{{text}}</span> at {{x}}'), {
      text: 'Launch',
      x: '2020-01-01',
    });

    expect(filled.textContent).toBe('Launch at 2020-01-01');
    expect(filled.id).toBe('');
  });

  it('substitutes into field values, so the edit form is prefilled', () => {
    const filled = fillTemplate(
      template('<input dg-ann-field="text" value="{{text}}">'),
      { text: 'Launch' },
    );

    expect(filled.querySelector('input')!.value).toBe('Launch');
  });

  it('leaves a value that is markup as text', () => {
    const filled = fillTemplate(template('<span>{{text}}</span>'), {
      text: '<img src=x onerror="alert(1)">',
    });

    expect(filled.querySelector('img')).toBe(null);
    expect(filled.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it('leaves a placeholder with no value alone', () => {
    const filled = fillTemplate(template('<span>{{missing}}</span>'), {
      text: 'x',
    });

    expect(filled.textContent).toBe('{{missing}}');
  });

  it('does not let a value be read as another placeholder', () => {
    const filled = fillTemplate(template('<span>{{text}}{{series}}</span>'), {
      text: '{{series}}',
      series: 'A',
    });

    expect(filled.textContent).toBe('{{series}}A');
  });
});

describe('makeEmitter', () => {
  it('delivers the payload on event.detail', () => {
    const target: any = {};
    makeEmitter(target);
    const heard = vi.fn();

    target.addEventListener('somethingChanged', heard);
    target.emit_('somethingChanged', { xval: 7 });

    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0]![0]!.detail).toEqual({ xval: 7 });

    target.removeEventListener('somethingChanged', heard);
    target.emit_('somethingChanged', { xval: 8 });
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe('drag', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const makeEl = () => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '100px';
    document.body.appendChild(el);
    return el;
  };

  const pointer = (type: string, clientX: number, clientY = 0) =>
    new (window as any).MouseEvent(type, {
      bubbles: true,
      clientX,
      clientY,
      button: 0,
    });

  /** jsdom has no PointerEvent, and the code only reads these four fields. */
  const send = (
    el: HTMLElement,
    type: string,
    clientX: number,
    clientY = 0,
  ) => {
    const e: any = pointer(type, clientX, clientY);
    e.pointerId = 1;
    el.dispatchEvent(e);
    return e;
  };

  it('reports positions clamped to the bounds', () => {
    const el = makeEl();
    const moves: number[] = [];
    drag(el, {
      axis: 'x',
      bounds: () => ({ min: 50, max: 150 }),
      onMove: (x) => moves.push(x),
    });

    send(el, 'pointerdown', 100);
    send(el, 'pointermove', 130); // 100 + 30
    send(el, 'pointermove', 200); // would be 200, clamped
    send(el, 'pointermove', 0); // would be 0, clamped
    send(el, 'pointerup', 0);

    expect(moves).toEqual([130, 150, 50]);
  });

  it('ignores moves once the drag has ended', () => {
    const el = makeEl();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    drag(el, {
      axis: 'x',
      bounds: () => ({ min: 0, max: 500 }),
      onMove,
      onEnd,
    });

    send(el, 'pointerdown', 100);
    send(el, 'pointerup', 120);
    send(el, 'pointermove', 300);

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('stops listening after teardown', () => {
    const el = makeEl();
    const onMove = vi.fn();
    const stop = drag(el, {
      axis: 'x',
      bounds: () => ({ min: 0, max: 500 }),
      onMove,
    });

    stop();
    send(el, 'pointerdown', 100);
    send(el, 'pointermove', 130);

    expect(onMove).not.toHaveBeenCalled();
  });
});

describe('toggle', () => {
  it('hides and restores the element', () => {
    const el = document.createElement('div');
    toggle(el, false);
    expect(el.style.display).toBe('none');
    toggle(el, true);
    expect(el.style.display).toBe('');
  });
});
