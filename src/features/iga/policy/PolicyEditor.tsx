/**
 * PolicyEditor — edit a draft's rules as a form.
 *
 * The same form is on the policy Rules tab. Saving sends the typed
 * authsec.runtime.v1 document. A published policy is shown read-only.
 */

import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";

import { useGetPolicyQuery } from "./policyApi";
import { RuleForm } from "./RuleForm";

export function PolicyEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useGetPolicyQuery(id!, { skip: !id });

  if (!id) return null;

  return (
    <ConsolePage
      title="Edit Policy Draft"
      description="Change the action, path, and effect of each rule."
      actions={
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      }
    >
      {isLoading && <div className="py-12 text-center text-sm text-muted-foreground">Loading policy...</div>}
      {isError && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Failed to load policy.{" "}
          <button type="button" className="underline" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}
      {data && !isLoading && (
        <RuleForm
          policyId={data.policy.id}
          policyName={data.policy.name}
          lifecycle={data.policy.lifecycle}
          revisions={data.revisions}
          etag={data.etag}
        />
      )}
    </ConsolePage>
  );
}

export default PolicyEditorPage;
