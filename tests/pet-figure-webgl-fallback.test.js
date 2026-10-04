import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createPet } from '../packages/cortico-world-desktop-pet/web/pet-core.js';
import { createRig } from '../packages/cortico-world-desktop-pet/web/rig/rig.js';

/**
 * 无可用 WebGL(如 GPU 被屏蔽又没有软件回退的 Intel Mac)时,大肥鱼挂载即抛错。
 * 页面层的对策是接住这个错并换回内置 Coo(pet-app/dress 的 applyFigure/showFigure);
 * 这里钉住它依赖的两个前提:错的来源,以及换回 null 后身体真的恢复。
 */

const MODEL = {
  deformers: { d1: { kind: 'rot', parent: null, pivot: [0, 0] } },
  parts: [{ id: 'body', tex: 'body', parent: 'd1', box: [0, 0, 100, 100] }],
  view: [0, 0, 100, 100],
};

function makePet() {
  const dom = new JSDOM('<svg><ellipse id="shadow"></ellipse><g id="pet"></g><g id="fx"></g></svg>');
  const doc = dom.window.document;
  const petG = doc.getElementById('pet');
  const sfx = new Proxy({}, { get: () => () => {} });
  const ctl = createPet(
    { petG, shadowEl: doc.getElementById('shadow'), fxG: doc.getElementById('fx') },
    { sfx, bounds: () => ({ W: 400, H: 300, floorY: 270, S: .42 }) },
  );
  ctl.resize();
  return { dom, ctl, petG };
}

describe('无 WebGL 环境下的形象切换', () => {
  it('createRig 拿不到 webgl2 上下文时抛错(挂载失败的根源)', () => {
    const canvas = { addEventListener() {}, getContext: () => null };
    expect(() => createRig(canvas, MODEL)).toThrow('webgl2 unavailable');
  });

  it('画不出的形象抛错后仍被赋上,换回 null 恢复内置 Coo,后续帧不再抛', () => {
    const { dom, ctl, petG } = makePet();
    const broken = { draw() { throw new Error('webgl2 unavailable'); }, dispose() {} };
    // setFigure 先赋 custom 再画:抛错发生在赋值之后,这正是循环里每帧重抛、页面层必须接住的原因
    expect(() => ctl.setFigure(broken)).toThrow('webgl2 unavailable');
    expect(ctl.figure).toBe(broken);
    expect(() => ctl.setFigure(null)).not.toThrow();
    expect(ctl.figure).toBeNull();
    expect(() => { ctl.step(.016); ctl.render(); }).not.toThrow();
    expect(petG.innerHTML.length).toBeGreaterThan(50); // 内置 Coo 画出来了
    dom.window.close();
  });
});
