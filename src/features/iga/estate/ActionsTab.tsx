/**
 * Actions tab — re-exports the full implementation from `features/iga/actions`.
 * The lazy import in WorkloadPage targets this file, so its default export
 * must be the component that receives { workspaceId, workloadId }.
 */

export { default } from "../actions/ActionsTab";
