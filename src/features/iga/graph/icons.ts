/** One icon per node kind, shared by the card, the inspector and the legend. */

import { Boxes, Building2, Container, Cpu, FileText, Globe2, KeyRound, Monitor, MoreHorizontal, ScanSearch, Server, User, Users, type LucideIcon } from "lucide-react";

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
  linux: Server,
  kubernetes: Container,
  directory: Building2,
  computer: Monitor,
};
