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
