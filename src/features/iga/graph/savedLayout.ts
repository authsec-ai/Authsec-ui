/**
 * The positions a customer set by dragging, remembered in this browser per
 * workspace, signed-in user, graph root and direction (SPEC-iga-phase2-graph.md
 * §2.14.15 *Manual positions*). Only drawn-node ids and coordinates are
 * stored — never evidence, labels or anything from the graph's content.
 * Ids that are no longer drawn are simply ignored when read back.
 */

import { SessionManager } from "@/utils/sessionManager";

import type { Position } from "./layout";

const MAX_SAVED = 400;

// A reversed graph lays the same cards out differently, so it keeps its own.
function key(ws: string, root: string, direction: string): string {
  const user = SessionManager.getSession()?.user_id ?? "-";
  return `iga-graph-layout:v1:${ws}:${user}:${root}:${direction}`;
}

export function readSavedLayout(ws: string, root: string, direction: string): Map<string, Position> {
  try {
    const raw = localStorage.getItem(key(ws, root, direction));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out = new Map<string, Position>();
    for (const [id, v] of Object.entries(parsed)) {
      if (Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "number") out.set(id, { x: v[0], y: v[1] });
    }
    return out;
  } catch {
    return new Map();
  }
}

export function writeSavedLayout(ws: string, root: string, direction: string, positions: Map<string, Position>): void {
  try {
    if (!positions.size) {
      localStorage.removeItem(key(ws, root, direction));
      return;
    }
    const out: Record<string, [number, number]> = {};
    for (const [id, p] of [...positions].slice(-MAX_SAVED)) out[id] = [Math.round(p.x), Math.round(p.y)];
    localStorage.setItem(key(ws, root, direction), JSON.stringify(out));
  } catch {
    // Storage blocked or full: positions still apply for this visit.
  }
}
