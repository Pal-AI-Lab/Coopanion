/**
 * Types for the parts of the desktop-pet World's `web/pet-core.js` the console uses: the icons of the
 * pet's menu (the 「习惯」 page's hover-button picker) and the pet's body (the guide). The module is
 * plain browser JavaScript; esbuild bundles it into the console from the workspace package.
 */
declare module 'cortico-world-desktop-pet/web/pet-core.js' {
  export const ICONS: Record<string, string>;
  export type Roam = 'free' | 'calm' | 'off';
  export interface PetBounds { W: number; H: number; floorY: number; S: number }
  export interface PetController {
    readonly pet: { x: number; facing: number; mode: string };
    readonly time: number;
    step(dt: number): void;
    render(): void;
    resize(): void;
    act(action: string): boolean;
    setExpr(name: string, seconds?: number): void;
    walkTo(x: number, run: boolean, id?: string): boolean;
    setRoam(roam: Roam): void;
    setListening(on: boolean): void;
    setThinking(on: boolean): void;
    talk(): void;
    holdRoam(seconds: number): void;
    busy(): boolean;
  }
  export function createPet(
    els: { petG: SVGGElement; shadowEl: SVGEllipseElement; fxG: SVGGElement },
    opts: { sfx?: unknown; roam?: Roam; bounds: () => PetBounds; enter?: 'drop' | 'walk'; startX?: number; onEvent?: (kind: string, detail: unknown) => void },
  ): PetController;
  export function normalizeSkin(raw: unknown): Record<string, unknown>;
  export function skinCss(skin: Record<string, unknown>, selector?: string): string;
}
