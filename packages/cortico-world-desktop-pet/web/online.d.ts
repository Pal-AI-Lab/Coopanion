export interface OnlinePoint {
  x: number;
  y: number;
}

export function interpolatedPoint(from: OnlinePoint, to: OnlinePoint, progress: number): OnlinePoint;

export function stagePoint(position: OnlinePoint, bounds: { W: number; H: number; floorY: number }): OnlinePoint;

export function boxBottomY(box: { y: number; h: number }): number;

export function introDelayFor(index: number): number;

