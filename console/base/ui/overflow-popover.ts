/** Align an overflow popup to its trigger, within the owning content row. */
export function placeOverflowPopover(pop: HTMLElement, anchor: HTMLElement, content: Element): void {
  const view = pop.ownerDocument.defaultView!;
  const bounds = content.getBoundingClientRect();
  const trigger = anchor.getBoundingClientRect();
  const left = Math.max(8, bounds.left);
  const right = Math.min(view.innerWidth - 8, bounds.right);
  pop.style.maxWidth = Math.min(360, Math.max(0, right - left)) + 'px';
  const below = Math.max(0, view.innerHeight - trigger.bottom - 14);
  const above = Math.max(0, trigger.top - 14);
  pop.style.maxHeight = Math.max(below, above) + 'px';
  const placeAbove = pop.scrollHeight > below && above > below;
  pop.style.maxHeight = (placeAbove ? above : below) + 'px';
  const rect = pop.getBoundingClientRect();
  pop.style.left = Math.max(left, Math.min(trigger.right, right) - rect.width) + 'px';
  pop.style.top = Math.max(8, placeAbove ? trigger.top - rect.height - 6 : trigger.bottom + 6) + 'px';
}
