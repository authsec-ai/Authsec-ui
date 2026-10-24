/**
 * The AWS resource types an access policy can be on, and the words the form
 * uses for each. Pure.
 *
 * One entry per `resource_type` the backend accepts on AWS (its AccessKinds
 * registry; capabilities list them as `access_policies.resource_types`). A new
 * type is one more entry here plus its picker. Azure is not in it: an Azure
 * policy is on one resource of any type, and its words are the form's own.
 *
 * `subScope` is what can narrow a policy inside the resource: S3's folder, or
 * nothing (the whole resource).
 */

import type { AccessLevel, AccessResourceType } from "@/app/api/igaAccessPoliciesApi";
import type { RuntimeKind } from "@/app/api/igaGraphApi";

export interface ResourceTypeCopy {
  /** "Choose a bucket.", "No bucket matches …". */
  noun: string;
  /** The type's choice in the form ("S3 bucket"). */
  pill: string;
  /** The form's section for the resource. */
  title: string;
  hint: string;
  /** The picker's accessible name. */
  label: string;
  /** The picker's prompt and search placeholder. */
  search: string;
  loading: string;
  /** Nothing found, before anything is typed. */
  empty: string;
  error: string;
  /** What each access level covers. */
  blurbs: Record<Exclude<AccessLevel, "all">, string>;
  /** What "All access" covers (block only). */
  allHint: string;
  /** Who and what the change leaves alone, under the summary. */
  untouched: string;
  subScope: "folder" | null;
  /** The type takes a block only: Allow is off in the form. */
  blockOnly?: boolean;
  /** The type has nothing to delete: Delete is off in the form. */
  noDelete?: boolean;
  /** Picked from Discovery's workloads of this kind, not from resource records. */
  workloads?: RuntimeKind;
}

export const RESOURCE_TYPES = {
  s3_bucket: {
    noun: "bucket",
    pill: "S3 bucket",
    title: "Bucket",
    hint: "Choose the S3 bucket (file storage) this rule is about. Only buckets that AuthSec has found in your AWS policies are listed. To cover just one folder, add it next to the bucket.",
    label: "Choose an S3 bucket",
    search: "Search for an S3 bucket",
    loading: "Looking for buckets…",
    empty: "No S3 bucket found yet. A bucket shows up here once one of your AWS policies mentions it.",
    error: "Buckets could not be read.",
    blurbs: {
      read: "List the folder and read objects.",
      write: "Upload and overwrite objects.",
      delete: "Remove objects and their versions.",
    },
    allHint: "Everything on this bucket or folder: reading, writing, deleting and listing.",
    untouched: "Only these roles change. Other roles, users, groups and bucket policies keep their access.",
    subScope: "folder",
  },
  dynamodb_table: {
    noun: "table",
    pill: "DynamoDB table",
    title: "Table",
    hint: "Choose the DynamoDB table this rule is about. Only tables that AuthSec has found in your AWS policies are listed. The rule covers the whole table and its indexes.",
    label: "Choose a DynamoDB table",
    search: "Search for a DynamoDB table",
    loading: "Looking for tables…",
    empty: "No DynamoDB table found yet. A table shows up here once one of your AWS policies mentions it.",
    error: "Tables could not be read.",
    blurbs: {
      read: "Get, query and scan items. Blocking it also stops streams, exports, restores and backups of the table.",
      write: "Put and update items.",
      delete: "Delete items. Blocking it also stops deleting the table.",
    },
    allHint: "Everything on this table: items, settings, streams, backups and replicas.",
    untouched: "Only these roles change. Other roles, users, groups and the table's resource policy keep their access.",
    subScope: null,
  },
  secretsmanager_secret: {
    noun: "secret",
    pill: "Secret",
    title: "Secret",
    hint: "Choose the Secrets Manager secret this rule is about. Only secrets that AuthSec has found in your AWS policies are listed. The rule covers the secret in every region, including replicas.",
    label: "Choose a Secrets Manager secret",
    search: "Search for a Secrets Manager secret",
    loading: "Looking for secrets…",
    empty: "No Secrets Manager secret found yet. A secret shows up here once one of your AWS policies mentions it.",
    error: "Secrets could not be read.",
    blurbs: {
      read: "Read the secret's value. Blocking it also stops replicating, rotating, tagging and resource-policy changes.",
      write: "Change the value, versions, rotation and tags.",
      delete: "Delete the secret or its replicas.",
    },
    allHint: "Everything on this secret, in every region.",
    untouched: "Only these roles change. Other roles, users, groups and the secret's resource policy keep their access.",
    subScope: null,
    blockOnly: true,
  },
  ssm_parameter: {
    noun: "parameter",
    pill: "SSM parameter",
    title: "Parameter",
    hint: "Choose the SSM Parameter Store parameter this rule is about. Only parameters that AuthSec has found in your AWS policies are listed.",
    label: "Choose an SSM parameter",
    search: "Search for an SSM parameter",
    loading: "Looking for parameters…",
    empty: "No SSM parameter found yet. A parameter shows up here once one of your AWS policies mentions it.",
    error: "Parameters could not be read.",
    blurbs: {
      read: "Read the value and its history. Blocking it also stops listing the paths above it.",
      write: "Put new values, labels and tags.",
      delete: "Delete the parameter.",
    },
    allHint: "Everything on this parameter, and listing the paths above it.",
    untouched: "Only these roles change. Other roles, users, groups and accounts it is shared with keep their access.",
    subScope: null,
    blockOnly: true,
  },
  bedrock_model: {
    noun: "model",
    pill: "Bedrock model",
    title: "Model",
    hint: "Choose the Bedrock foundation model this rule is about. Models that AuthSec has found in your AWS policies are listed, also through cross-region inference profiles. The rule covers the model in every region.",
    label: "Choose a Bedrock model",
    search: "Search for a Bedrock model",
    loading: "Looking for models…",
    empty: "No Bedrock model found yet. A model shows up here once one of your AWS policies names it.",
    error: "Models could not be read.",
    blurbs: {
      read: "Call the model, directly or through inference profiles, prompt routers and batch jobs.",
      write: "Fine-tune it, buy provisioned throughput, and build profiles, routers and evaluations on it.",
      delete: "A model has nothing to delete.",
    },
    allHint: "Everything on this model, in every region.",
    untouched: "Only these roles change. Other roles, users (including those holding Bedrock API keys) and groups keep their access.",
    subScope: null,
    blockOnly: true,
    noDelete: true,
  },
  bedrock_agent: {
    noun: "agent",
    pill: "Bedrock agent",
    title: "Agent",
    hint: "Choose the Bedrock agent this rule is about, from the agents Discovery found. The rule covers every alias and version of it.",
    label: "Choose a Bedrock agent",
    search: "Search for a Bedrock agent",
    loading: "Looking for agents…",
    empty: "No Bedrock agent found yet. Agents show up here after a scan of an AWS account that has them.",
    error: "Agents could not be read.",
    blurbs: {
      read: "Invoke the agent and read its memory.",
      write: "Change the agent, its aliases, action groups, collaborators and knowledge bases.",
      delete: "Delete the agent, its aliases, versions and memory.",
    },
    allHint: "Everything on this agent.",
    untouched: "Only these roles change. Other roles, users and groups keep their access, and the agent's own role is unchanged.",
    subScope: null,
    blockOnly: true,
    workloads: "bedrock_agent",
  },
  agentcore_runtime: {
    noun: "agent runtime",
    pill: "AgentCore runtime",
    title: "Agent runtime",
    hint: "Choose the AgentCore runtime this rule is about, from the runtimes Discovery found. The rule covers every endpoint of it.",
    label: "Choose an AgentCore runtime",
    search: "Search for an AgentCore runtime",
    loading: "Looking for agent runtimes…",
    empty: "No AgentCore runtime found yet. Runtimes show up here after a scan of an AWS account that has them.",
    error: "Agent runtimes could not be read.",
    blurbs: {
      read: "Invoke the agent and read its agent card.",
      write: "Change the runtime and its endpoints, stop sessions, change its resource policy.",
      delete: "Delete the runtime or its endpoints.",
    },
    allHint: "Everything on this agent runtime.",
    untouched: "Only these roles change. Other roles, users, groups, OAuth callers and the runtime's resource policy keep their access.",
    subScope: null,
    blockOnly: true,
    workloads: "bedrock_agentcore_runtime",
  },
} satisfies Partial<Record<AccessResourceType, ResourceTypeCopy>>;

export type AwsResourceType = keyof typeof RESOURCE_TYPES;

/** The words for an AWS resource type, or undefined for any other type (Azure, unknown, ""). */
export function resourceTypeCopy(type: string | undefined): ResourceTypeCopy | undefined {
  return type && Object.prototype.hasOwnProperty.call(RESOURCE_TYPES, type) ? RESOURCE_TYPES[type as AwsResourceType] : undefined;
}
