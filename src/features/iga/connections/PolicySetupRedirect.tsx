/**
 * `/iga/policy/setup[/section]`: where policy setup lived before it moved onto
 * each connection's page. Slack messages (the "Link your account" message, the
 * install return) and readiness links still name it, so it forwards to that
 * tab of a connection that has it, keeping the query — a `slack_link` token is
 * read and stripped by the tab (`useSlackReturn`). Notifications and settings
 * are workspace-wide, so any such connection serves.
 */

import { Navigate, useLocation, useParams } from "react-router-dom";

import { useListDiscoveryConnectionsQuery } from "@/app/api/connectionsApi";

import { setupTarget } from "./connectionModel";

export default function PolicySetupRedirect() {
  const { section } = useParams<{ section?: string }>();
  const { search } = useLocation();
  const { data, isLoading } = useListDiscoveryConnectionsQuery();
  if (isLoading) return null;
  return <Navigate to={{ pathname: setupTarget(data, section), search }} replace />;
}
