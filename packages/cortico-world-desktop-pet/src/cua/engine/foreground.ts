/** The system's keyboard target, independent of the windows offered for listing and focus. */
export interface ForegroundWindow {
  /** Empty when the window is untitled or its title cannot be read. */
  title: string;
  app: string | null;
  /** Native screen coordinates; null when the focused window's bounds cannot be read. */
  rect: { x: number; y: number; width: number; height: number } | null;
}
