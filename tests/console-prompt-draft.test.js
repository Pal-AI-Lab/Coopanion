// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { promptInput } from '../console/base/ui/prompt-input.tsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const KEY = 'test.draft';
const image = { name: 'a.png', mime: 'image/png', base64: 'iVBORw0KGgo=', bytes: 8, width: 1, height: 1 };
const pages = [];

function open(sent = []) {
  const page = new AbortController();
  pages.push(page);
  let input;
  act(() => { input = promptInput(document, page.signal, { draftKey: KEY, images: { max: 8 }, onSubmit: (text) => { sent.push(text); } }); });
  document.body.append(input.el);
  return { input, page, textarea: input.el.querySelector('textarea') };
}

async function type(textarea, text) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

afterEach(() => {
  act(() => { for (const page of pages.splice(0)) page.abort(); });
  document.body.replaceChildren();
  localStorage.clear();
});

describe('composer draft', () => {
  it('outlives leaving the page and is gone once sent', async () => {
    const first = open();
    await type(first.textarea, 'half a sentence');
    await act(async () => first.input.restore('', [image]));
    act(() => first.page.abort());

    const sent = [];
    const again = open(sent);
    expect(again.textarea.value).toBe('half a sentence');
    expect(again.input.el.querySelectorAll('img')).toHaveLength(1);

    await act(async () => again.input.el.querySelector('form').requestSubmit());
    expect(sent).toEqual(['half a sentence']);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(`${KEY}.images`)).toBeNull();
  });
});

describe('composer length cap', () => {
  it('keeps text past the cap, counts it and does not send it', async () => {
    const { S } = await import('../console/base/ui/strings.ts');
    const sent = [];
    const { input, textarea } = open(sent);
    act(() => input.setMaxLength(10));
    const form = input.el.querySelector('form'), button = input.el.querySelector('button[type="submit"]');
    const count = () => input.el.querySelector('[data-count]');

    // at the cap, the surrounding whitespace not counted: no hint
    await type(textarea, ' 1234567890 ');
    expect(count()).toBeNull();
    expect(button.disabled).toBe(false);

    await type(textarea, '123456789012');
    expect(count().textContent).toBe('12 / 10');
    expect(input.el.querySelector('[role="status"]').textContent).toBe(S.tooLong(2, 10));
    expect(button.disabled).toBe(true);
    await act(async () => form.requestSubmit());
    expect(sent).toEqual([]);
    expect(textarea.value).toBe('123456789012');

    await type(textarea, '1234567890');
    expect(count()).toBeNull();
    await act(async () => form.requestSubmit());
    expect(sent).toEqual(['1234567890']);
  });
});

describe('composer scrolling', () => {
  it('fades the edges the text runs past', async () => {
    const { textarea } = open();
    await type(textarea, 'line');
    expect(textarea.dataset.more).toBeUndefined();
    // jsdom lays nothing out: the text's height and the field's are given
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 300 });
    Object.defineProperty(textarea, 'clientHeight', { configurable: true, value: 100 });
    await act(async () => { textarea.scrollTop = 0; textarea.dispatchEvent(new Event('scroll')); });
    expect(textarea.dataset.more).toBe('below');
    await act(async () => { textarea.scrollTop = 100; textarea.dispatchEvent(new Event('scroll')); });
    expect(textarea.dataset.more).toBe('above below');
    await act(async () => { textarea.scrollTop = 200; textarea.dispatchEvent(new Event('scroll')); });
    expect(textarea.dataset.more).toBe('above');
  });
});
