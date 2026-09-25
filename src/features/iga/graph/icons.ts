/** One icon per node kind, shared by the card, the inspector and the legend. */

import { Boxes, Cpu, FileText, Globe2, KeyRound, MoreHorizontal, ScanSearch, User, Users, type LucideIcon } from "lucide-react";

import type { NodeIcon } from "./nodeView";

export const NODE_ICON: Record<NodeIcon, LucideIcon> = {
  workload: Cpu,
  role: KeyRound,
  user: User,
  group: Users,
  external: Globe2,
  statement: FileText,
  resource: Boxes,
  selector: ScanSearch,
  more: MoreHorizontal,
};
