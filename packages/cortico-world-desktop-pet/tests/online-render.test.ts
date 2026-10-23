// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boxBottomY, interpolatedPoint, introDelayFor, stagePoint } from '../web/online.js';

describe('online remote movement', () => {
  it('interpolates both axes between 20 Hz position samples', () => {
    expect(interpolatedPoint({ x: .2, y: .8 }, { x: .6, y: .95 }, .25)).toEqual({ x: .3, y: .8375 });
    expect(interpolatedPoint({ x: .2, y: .8 }, { x: .6, y: .95 }, 1)).toEqual({ x: .6, y: .95 });
  });

  it('clamps progress at the start and end of a sample', () => {
    expect(interpolatedPoint({ x: .2, y: .8 }, { x: .6, y: .95 }, -1)).toEqual({ x: .2, y: .8 });
    expect(interpolatedPoint({ x: .2, y: .8 }, { x: .6, y: .95 }, 2)).toEqual({ x: .6, y: .95 });
  });

  it('maps both axes to each player’s current stage size', () => {
    expect(stagePoint({ x: .25, y: -.1 }, { W: 1280, H: 600, floorY: 552 })).toEqual({ x: 320, y: 492 });
    expect(stagePoint({ x: .25, y: -.1 }, { W: 2000, H: 720, floorY: 672 })).toEqual({ x: 500, y: 600 });
  });

  it('anchors players by the bottom centre so different scales share the same ground point', () => {
    expect(boxBottomY({ y: 180, h: 240 })).toBe(420);
    expect(boxBottomY({ y: 100, h: 320 })).toBe(420);
  });

  it('drops existing players into a joined room one after another', () => {
    expect([0, 1, 2].map(introDelayFor)).toEqual([0, 350, 700]);
  });

});
