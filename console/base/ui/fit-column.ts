/**
 * 上下对齐的一列按其中最宽的内容取宽：probes 造出这一列的内容(与真实节点同类名)，放进 host 里量出
 * 最宽的一个，写进 host 的 CSS 变量 `name`(px)。CSS 写 `max(原宽度, var(name, 0px))`,原宽度是下限。
 * host 不在页面上时不写；字体加载完再量一次。返回重新量的函数，列里的内容变了时调用。
 */
export function fitColumn(host: HTMLElement, name: string, probes: () => readonly HTMLElement[]): () => void {
  const measure = () => {
    if (!host.isConnected) return;
    const nodes = probes();
    for (const node of nodes) {
      node.style.cssText += ';position:absolute;left:0;top:0;width:auto;max-width:none;visibility:hidden;pointer-events:none;white-space:nowrap';
      node.setAttribute('aria-hidden', 'true');
      host.append(node);
    }
    const width = Math.ceil(Math.max(0, ...nodes.map(node => node.getBoundingClientRect().width)));
    for (const node of nodes) node.remove();
    host.style.setProperty(name, `${width}px`);
  };
  measure();
  void host.ownerDocument.fonts?.ready.then(measure);
  return measure;
}
