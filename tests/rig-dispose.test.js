import { describe, expect, it } from 'vitest';
import { createRig } from '../packages/cortico-world-desktop-pet/web/rig/rig.js';

/** 环境无 WebGL:createRig 只碰传入的 canvas,用一个记录调用的桩 GL 驱动它。 */
function stubGL() {
  const calls = [];
  const gl = new Proxy({}, {
    get(_, fn) {
      if (fn === 'getShaderParameter' || fn === 'getProgramParameter') return () => true;
      if (fn === 'getAttribLocation') return () => 0;
      if (fn === 'getUniformLocation') return () => ({});
      if (fn === 'isContextLost') return () => false;
      if (fn === 'getExtension') return (name) => (name === 'WEBGL_lose_context' ? { loseContext: () => calls.push({ fn: 'loseContext' }) } : null);
      return (...args) => { calls.push({ fn: String(fn), arg: args[0] }); return {}; };
    },
  });
  return { gl, calls, of: (fn) => calls.filter((c) => c.fn === fn).length };
}

const MODEL = {
  deformers: { d1: { kind: 'rot', parent: null, pivot: [0, 0] } },
  parts: [{ id: 'body', tex: 'body', parent: 'd1', box: [0, 0, 100, 100] }],
  view: [0, 0, 100, 100],
};

function makeRig() {
  const { gl, of } = stubGL();
  const listeners = {};
  const canvas = { addEventListener(type, fn) { listeners[type] = fn; }, getContext: () => gl };
  const rig = createRig(canvas, MODEL);
  return { rig, of, fire: (type) => listeners[type]({ preventDefault() {} }) };
}

describe('rig dispose', () => {
  it('释放纹理、缓冲、VAO、程序与着色器,并丢失上下文', () => {
    const { rig, of } = makeRig();
    rig.upload('body', {});
    rig.render({});
    rig.dispose();
    expect(of('deleteTexture')).toBe(1);   // body
    expect(of('deleteBuffer')).toBe(3);    // pos + uv + index
    expect(of('deleteVertexArray')).toBe(1);
    expect(of('deleteProgram')).toBe(1);
    expect(of('deleteShader')).toBe(2);
    expect(of('loseContext')).toBe(1);
  });

  it('dispose 后 upload/render 不再创建 GL 资源,重复 dispose 无副作用', () => {
    const { rig, of } = makeRig();
    rig.dispose();
    rig.dispose();
    const created = of('createTexture') + of('createBuffer') + of('createVertexArray') + of('createProgram');
    rig.upload('body', {});
    rig.render({});
    expect(of('createTexture') + of('createBuffer') + of('createVertexArray') + of('createProgram')).toBe(created);
    expect(of('loseContext')).toBe(1);
  });

  it('上下文丢失期间 dispose,之后浏览器恢复上下文也不重建 GL 资源', () => {
    const { rig, of, fire } = makeRig();
    rig.upload('body', {});
    fire('webglcontextlost');
    rig.dispose();
    const created = of('createTexture') + of('createBuffer') + of('createVertexArray') + of('createProgram');
    fire('webglcontextrestored');
    expect(of('createTexture') + of('createBuffer') + of('createVertexArray') + of('createProgram')).toBe(created);
  });
});
