import type { Item } from 'cortico/protocol/open-responses/context.ts';

function partsText(content: string | readonly unknown[] | null | undefined): string {
  if (typeof content === 'string') return content;
  return (content ?? []).map(part => {
    const p = part as { text?: string; refusal?: string };
    return p.text ?? p.refusal ?? '';
  }).join('');
}

/** Extract readable text from the Item without changing its stored shape. */
export function itemText(item: Item): string {
  if (item.type === 'message') return partsText(item.content);
  if (item.type === 'function_call_output') return partsText(item.output);
  if (item.type === 'reasoning') return partsText(item.content) || partsText(item.summary);
  return '';
}
