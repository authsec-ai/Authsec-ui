/** One connection, resolved by id from the connections read. */

import { useEffect, useState } from "react";

import { useListConnectionsQuery } from "@/app/api/connectionsApi";
import { loadFailureOf, type LoadFailure } from "@/components/console/load-failure";

import { scanInFlight } from "./connectionModel";

const POLL_MS = 5_000;

export function useConnection(id: string) {
  const [poll, setPoll] = useState(0);
  const query = useListConnectionsQuery(undefined, { pollingInterval: poll, skipPollingIfUnfocused: true });
  const connection = query.data?.find((c) => c.id === id);
  const inFlight = !!connection && scanInFlight(connection);
  useEffect(() => setPoll(inFlight ? POLL_MS : 0), [inFlight]);

  // The three answers stay apart: still loading, could not be loaded, and loaded without it.
  const failure: LoadFailure | null = connection ? null : query.data ? null : loadFailureOf(query.error);
  const notFound = !connection && query.isSuccess;
  return { connection, loading: query.isLoading, failure, notFound, refetch: () => query.refetch(), refreshFailed: query.isError && !!query.data };
}
