/** Align an overflow popup to its trigger, within the owning content row. */
export function placeOverflowPopover(pop: HTMLElement, anchor: HTMLElement, content: Element): void {
  const view = pop.ownerDocument.defaultView!;
  const bounds = content.getBoundingClientRect();
  const trigger = anchor.getBoundingClientRect();
  const left = Math.max(8, bounds.left);
  const right = Math.min(view.innerWidth - 8, bounds.right);
  pop.style.maxWidth = Math.min(360, Math.max(0, right - left)) + 'px';
  pop.style.left = Math.max(left, Math.min(trigger.right, right) - pop.getBoundingClientRect().width) + 'px';
  pop.style.top = Math.max(8, Math.min(trigger.bottom + 6, view.innerHeight - pop.offsetHeight - 8)) + 'px';
}
