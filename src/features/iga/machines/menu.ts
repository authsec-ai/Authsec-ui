/** The right-click menu's model (MachineParts renders it). */

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

/** Opens a menu at the pointer (right-click) or under the element (the ⋯ button). */
export function menuAt(e: React.MouseEvent, items: MenuItem[]): MenuState {
  e.preventDefault();
  if (e.type === "contextmenu") return { x: e.clientX, y: e.clientY, items };
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.left, y: r.bottom + 4, items };
}
