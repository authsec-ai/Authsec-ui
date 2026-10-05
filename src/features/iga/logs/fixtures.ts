/**
 * Sample events for the Logs preview (SPEC-console-revamp.md, "Logs — preview").
 *
 * Everything here is invented: account ids, cluster, organisation, workloads and
 * people are fictional, and the page says so in its banner. The set is built to
 * be consistent — every event's object is in OBJECTS, a scan's events are
 * ordered queued → running → finished or failed, a failed scan carries its
 * reason, a publication follows the scan it came from, nothing is scanned after
 * its connection was revoked — and to cover every kind.
 *
 * Times are minutes before the page loaded, so "last hour" and "last 7 days"
 * always have something in them.
 */

export type LogKind =
  | "scan_queued"
  | "scan_running"
  | "scan_finished"
  | "scan_failed"
  | "publication_published"
  | "classification_decided"
  | "connection_added"
  | "connection_revoked"
  | "sighting_seen"
  | "sign_in";

export const LOG_KINDS: readonly LogKind[] = [
  "scan_queued",
  "scan_running",
  "scan_finished",
  "scan_failed",
  "publication_published",
  "classification_decided",
  "connection_added",
  "connection_revoked",
  "sighting_seen",
  "sign_in",
];

export const KIND_LABEL: Record<LogKind, string> = {
  scan_queued: "Scan queued",
  scan_running: "Scan running",
  scan_finished: "Scan finished",
  scan_failed: "Scan failed",
  publication_published: "Publication published",
  classification_decided: "Classification decided",
  connection_added: "Connection added",
  connection_revoked: "Connection revoked",
  sighting_seen: "Sighting seen",
  sign_in: "Sign-in",
};

/** What a kind of event means, in one line. */
export const KIND_MEANING: Record<LogKind, string> = {
  scan_queued: "A scan was requested and is waiting for a worker to start it.",
  scan_running: "The scan has started and is reading the connected account, cluster or organisation.",
  scan_finished: "The scan read everything it was allowed to and recorded what it saw.",
  scan_failed: "The scan stopped before it finished, so it recorded nothing new.",
  publication_published: "What a finished scan saw was made visible in Discovery.",
  classification_decided: "A person or a rule decided what kind of thing a discovered object is.",
  connection_added: "A source was connected so that it can be scanned.",
  connection_revoked: "The connection was withdrawn, so its source is no longer scanned.",
  sighting_seen: "Discovery saw an object in a connected source.",
  sign_in: "A person signed in to the console.",
};

export interface LogObject {
  id: string;
  kind: "connection" | "scan" | "publication" | "workload" | "person";
  name: string;
  /** What the object is, in a few words: "ECS task definition". */
  what: string;
}

export interface LogActor {
  id: string;
  label: string;
  type: "person" | "system";
}

export interface LogSource {
  id: string;
  label: string;
}

export interface LogEvent {
  id: string;
  /** ISO 8601. */
  at: string;
  kind: LogKind;
  actor: LogActor;
  source: LogSource;
  object: LogObject;
  /** One plain sentence. */
  sentence: string;
  /** The outcome, in words. */
  outcome: string;
  /** Why a scan failed. */
  reason?: string;
  /** The record as the preview's sample store holds it. */
  raw: Record<string, unknown>;
}

const MIN = 60_000;
const NOW = Date.now();

/** The preview's clock: the moment the sample set was built. */
export const SAMPLE_NOW = NOW;
const ago = (minutes: number) => new Date(NOW - minutes * MIN).toISOString();

const SOURCES = {
  aws1: { id: "aws-111122223333", label: "AWS account 111122223333" },
  aws2: { id: "aws-444455556666", label: "AWS account 444455556666" },
  aws3: { id: "aws-777788889999", label: "AWS account 777788889999" },
  k8s: { id: "k8s-sample-cluster", label: "Cluster sample-cluster" },
  gh: { id: "github-sample-org", label: "GitHub organisation sample-org" },
  console: { id: "console", label: "AuthSec console" },
} satisfies Record<string, LogSource>;

const ACTORS = {
  ada: { id: "ada@example.test", label: "ada@example.test", type: "person" },
  grace: { id: "grace@example.test", label: "grace@example.test", type: "person" },
  scheduler: { id: "scheduler", label: "Scheduler", type: "system" },
  scanner: { id: "scanner", label: "Scanner", type: "system" },
  rules: { id: "classification-rules", label: "Classification rules", type: "system" },
} satisfies Record<string, LogActor>;

const connection = (id: string, source: LogSource): LogObject => ({ id, kind: "connection", name: source.label, what: "Connection" });

const OBJ = {
  connAws1: connection("conn-aws-1", SOURCES.aws1),
  connAws2: connection("conn-aws-2", SOURCES.aws2),
  connAws3: connection("conn-aws-3", SOURCES.aws3),
  connK8s: connection("conn-k8s", SOURCES.k8s),
  connGh: connection("conn-gh", SOURCES.gh),
  ordersTask: { id: "wl-orders-task", kind: "workload", name: "orders-task", what: "ECS task definition" },
  billingFn: { id: "wl-billing-fn", kind: "workload", name: "billing-fn", what: "Lambda function" },
  reportRunner: { id: "wl-report-runner", kind: "workload", name: "report-runner", what: "EC2 instance role" },
  ordersApi: { id: "wl-orders-api", kind: "workload", name: "orders-api", what: "Kubernetes Deployment" },
  syncBot: { id: "wl-sync-bot", kind: "workload", name: "sync-bot", what: "GitHub App" },
  ada: { id: "person-ada", kind: "person", name: "ada@example.test", what: "Console user" },
  grace: { id: "person-grace", kind: "person", name: "grace@example.test", what: "Console user" },
} satisfies Record<string, LogObject>;

type Draft = Omit<LogEvent, "id" | "raw"> & { minutesAgo: number; detail: Record<string, string | number | boolean> };

const drafts: Draft[] = [];

function emit(
  minutesAgo: number,
  kind: LogKind,
  actor: LogActor,
  source: LogSource,
  object: LogObject,
  sentence: string,
  outcome: string,
  detail: Draft["detail"] = {},
) {
  drafts.push({ minutesAgo, at: ago(minutesAgo), kind, actor, source, object, sentence, outcome, detail });
}

const scanObject = (n: number): LogObject => ({ id: `scan-${n}`, kind: "scan", name: `Scan ${n}`, what: "Scan" });
const publicationObject = (n: number): LogObject => ({ id: `publication-${n}`, kind: "publication", name: `Publication ${n}`, what: "Publication" });

type ScanEnd =
  | { end: "queued" }
  | { end: "running" }
  | { end: "finished"; minutes: number; objects: number }
  | { end: "failed"; minutes: number; reason: string };

let publications = 0;

/** One scan's events, in order: queued, running, then finished (and published) or failed. */
function scan(n: number, source: LogSource, startedMinutesAgo: number, how: ScanEnd, requestedBy: LogActor = ACTORS.scheduler) {
  const s = scanObject(n);
  const target = source.label;
  emit(startedMinutesAgo, "scan_queued", requestedBy, source, s, `Scan ${n} of ${target} was queued.`, "Waiting to start", {
    requestedBy: requestedBy.id,
  });
  if (how.end === "queued") return;
  const runningAt = startedMinutesAgo - 1;
  emit(runningAt, "scan_running", ACTORS.scanner, source, s, `Scan ${n} started reading ${target}.`, "In progress");
  if (how.end === "running") return;
  const endedAt = runningAt - how.minutes;
  if (how.end === "failed") {
    emit(endedAt, "scan_failed", ACTORS.scanner, source, s, `Scan ${n} of ${target} failed: ${how.reason}`, "Failed", {
      reason: how.reason,
      objectsRecorded: 0,
    });
    return;
  }
  emit(endedAt, "scan_finished", ACTORS.scanner, source, s, `Scan ${n} of ${target} finished and saw ${how.objects} objects.`, "Succeeded", {
    objectsSeen: how.objects,
  });
  publications += 1;
  emit(
    endedAt - 0.5,
    "publication_published",
    ACTORS.scanner,
    source,
    publicationObject(publications),
    `Publication ${publications} was made from scan ${n}, so its ${how.objects} objects are now in Discovery.`,
    "Published",
    { fromScan: `scan-${n}`, objects: how.objects },
  );
}

function connectionEvent(minutesAgo: number, kind: "connection_added" | "connection_revoked", actor: LogActor, source: LogSource, object: LogObject) {
  const added = kind === "connection_added";
  emit(
    minutesAgo,
    kind,
    actor,
    source,
    object,
    added ? `${actor.label} added the connection to ${source.label}.` : `${actor.label} revoked the connection to ${source.label}; it will not be scanned again.`,
    added ? "Added" : "Revoked",
  );
}

function sighting(minutesAgo: number, source: LogSource, object: LogObject, firstTime: boolean) {
  emit(
    minutesAgo,
    "sighting_seen",
    ACTORS.scanner,
    source,
    object,
    `${object.name} (${object.what}) was seen in ${source.label}${firstTime ? " for the first time" : " again"}.`,
    "Seen",
    { firstTime },
  );
}

function classified(minutesAgo: number, actor: LogActor, source: LogSource, object: LogObject, as: string) {
  emit(minutesAgo, "classification_decided", actor, source, object, `${object.name} was classified as ${as}${actor.type === "person" ? ` by ${actor.label}` : " by a rule"}.`, "Decided", {
    classification: as,
  });
}

function signIn(minutesAgo: number, actor: LogActor, object: LogObject) {
  emit(minutesAgo, "sign_in", actor, SOURCES.console, object, `${actor.label} signed in to the console.`, "Succeeded");
}

// Oldest first. Scan numbers rise with time; a source is never scanned after it is revoked.
signIn(12020, ACTORS.ada, OBJ.ada);
connectionEvent(12000, "connection_added", ACTORS.ada, SOURCES.aws1, OBJ.connAws1);
scan(1031, SOURCES.aws1, 11900, { end: "finished", minutes: 10, objects: 202 });
sighting(11893, SOURCES.aws1, OBJ.ordersTask, true);
sighting(11892, SOURCES.aws1, OBJ.billingFn, true);
classified(11885, ACTORS.rules, SOURCES.aws1, OBJ.billingFn, "a workload");
classified(11800, ACTORS.ada, SOURCES.aws1, OBJ.ordersTask, "an agent");
signIn(11050, ACTORS.grace, OBJ.grace);
connectionEvent(11000, "connection_added", ACTORS.grace, SOURCES.aws3, OBJ.connAws3);
scan(1032, SOURCES.aws3, 10900, { end: "finished", minutes: 6, objects: 61 });
connectionEvent(9000, "connection_added", ACTORS.grace, SOURCES.gh, OBJ.connGh);
scan(1033, SOURCES.gh, 8900, { end: "finished", minutes: 1.5, objects: 12 });
sighting(8898, SOURCES.gh, OBJ.syncBot, true);
classified(8700, ACTORS.grace, SOURCES.gh, OBJ.syncBot, "not an agent");
connectionEvent(8000, "connection_added", ACTORS.ada, SOURCES.k8s, OBJ.connK8s);
scan(1034, SOURCES.k8s, 7900, { end: "finished", minutes: 2, objects: 38 });
sighting(7898, SOURCES.k8s, OBJ.ordersApi, true);
signIn(7100, ACTORS.grace, OBJ.grace);
classified(7000, ACTORS.grace, SOURCES.k8s, OBJ.ordersApi, "an agent");
scan(1035, SOURCES.aws1, 7200, { end: "finished", minutes: 8, objects: 198 });
connectionEvent(6000, "connection_added", ACTORS.ada, SOURCES.aws2, OBJ.connAws2);
scan(1036, SOURCES.aws2, 5800, { end: "finished", minutes: 7, objects: 156 });
sighting(5795, SOURCES.aws2, OBJ.reportRunner, true);
scan(1037, SOURCES.aws1, 4400, { end: "finished", minutes: 9, objects: 203 });
signIn(4380, ACTORS.ada, OBJ.ada);
scan(1038, SOURCES.aws2, 3100, {
  end: "failed",
  minutes: 2,
  reason: "AWS rate limits stopped the scan while it listed IAM roles, after three retries.",
});
scan(1039, SOURCES.aws1, 2900, { end: "finished", minutes: 9, objects: 209 });
sighting(2893, SOURCES.aws1, OBJ.billingFn, false);
signIn(2850, ACTORS.grace, OBJ.grace);
connectionEvent(2000, "connection_revoked", ACTORS.ada, SOURCES.aws3, OBJ.connAws3);
scan(1040, SOURCES.gh, 1700, { end: "finished", minutes: 1, objects: 12 });
scan(1041, SOURCES.k8s, 1500, { end: "finished", minutes: 2, objects: 38 });
signIn(1450, ACTORS.ada, OBJ.ada);
scan(1042, SOURCES.aws1, 700, { end: "finished", minutes: 8, objects: 214 }, ACTORS.ada);
sighting(695, SOURCES.aws1, OBJ.ordersTask, false);
signIn(420, ACTORS.ada, OBJ.ada);
scan(1043, SOURCES.aws2, 300, {
  end: "failed",
  minutes: 1.5,
  reason: "the role AuthSecScanRole in the account could not be assumed. Check the role's trust policy.",
});
classified(50, ACTORS.ada, SOURCES.aws2, OBJ.reportRunner, "an agent");
signIn(25, ACTORS.grace, OBJ.grace);
scan(1044, SOURCES.aws1, 14, { end: "running" });
scan(1045, SOURCES.k8s, 3, { end: "queued" });

/** Every object an event refers to. The page names them but does not link to them: they are samples. */
export const OBJECTS: LogObject[] = [...new Map([...Object.values(OBJ), ...drafts.map((d) => d.object)].map((o) => [o.id, o])).values()];

/** Newest first; ids rise with time. */
export const LOG_EVENTS: LogEvent[] = [...drafts]
  .sort((a, b) => a.minutesAgo - b.minutesAgo)
  .map((d, i, all): LogEvent => {
    const id = `evt-${String(all.length - i).padStart(4, "0")}`;
    return {
      id,
      at: d.at,
      kind: d.kind,
      actor: d.actor,
      source: d.source,
      object: d.object,
      sentence: d.sentence,
      outcome: d.outcome,
      reason: typeof d.detail.reason === "string" ? d.detail.reason : undefined,
      raw: {
        id,
        sample: true,
        at: d.at,
        kind: d.kind,
        actor: { id: d.actor.id, type: d.actor.type },
        source: d.source.id,
        object: { id: d.object.id, kind: d.object.kind },
        outcome: d.outcome,
        detail: d.detail,
      },
    };
  });
