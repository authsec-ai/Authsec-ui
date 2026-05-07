import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { toast } from "react-hot-toast";

import { useCreateApplicationMutation } from "@/app/api/applicationsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  buildResourceServerPayload,
  computeResourceURI,
  DEFAULT_FORM,
  type ResourceServerFormState,
} from "../resource-servers/resource-server-utils";
import {
  consolePage,
  DecisionBanner,
  SectionHeader,
  Surface,
} from "./components/ApplicationConsole";

export default function CreateApplicationPage() {
  const navigate = useNavigate();
  const [createApplication, { isLoading }] = useCreateApplicationMutation();
  const [form, setForm] = useState<ResourceServerFormState>(DEFAULT_FORM);

  const protectedUrl = useMemo(
    () => computeResourceURI(form.public_base_url, form.protected_base_path),
    [form.public_base_url, form.protected_base_path],
  );

  const handleField =
    (key: keyof ResourceServerFormState) =>
    (event: ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Application name is required.");
      return;
    }
    if (!form.public_base_url.trim()) {
      toast.error("Public base URL is required.");
      return;
    }

    try {
      const response = await createApplication(
        buildResourceServerPayload({
          ...form,
          registration_modes: "cimd",
        }),
      ).unwrap();
      toast.success("Application created. Now protect it.");
      navigate(`/applications/${response.id}/setup`, {
        replace: true,
        state: { introspectionSecret: response.introspection_secret },
      });
    } catch (error) {
      const message =
        (error as { data?: { error?: string } })?.data?.error ??
        "Failed to create application.";
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70">
      <div className={consolePage}>
        <SectionHeader
          eyebrow="New protected application"
          title="Create application"
          description="Register the endpoint first. AuthSec will guide protection, tool review, access, testing, and launch after creation."
          actions={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={() => navigate("/applications")}
            >
              <X className="size-4" />
            </Button>
          }
        />

        <DecisionBanner
          tone="info"
          title="Create and protect"
          body="Start with the public base URL and protected path. The final resource URI becomes the anchor for OAuth resource indicators and SDK policy."
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,720px)_minmax(18rem,1fr)]">
          <Surface className="p-6">
            <h2 className="text-base font-semibold text-slate-950">
              Protected endpoint
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Keep OAuth and client details out of the first decision.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Application name">
                <Input
                  value={form.name}
                  onChange={handleField("name")}
                  placeholder="GitHub MCP Server"
                  className="h-10"
                />
              </Field>
              <Field label="Public base URL">
                <Input
                  value={form.public_base_url}
                  onChange={handleField("public_base_url")}
                  placeholder="https://mcp.example.com"
                  className="h-10"
                />
              </Field>
              <Field label="Protected path">
                <Input
                  value={form.protected_base_path}
                  onChange={handleField("protected_base_path")}
                  placeholder="/mcp"
                  className="h-10"
                />
              </Field>
            </div>

            <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-blue-700">
                Resource URI preview
              </p>
              <p className="mt-2 break-all font-mono text-sm font-semibold text-slate-950">
                {protectedUrl || "https://mcp.example.com/mcp"}
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate("/applications")}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? "Creating..." : "Create and protect"}
              </Button>
            </div>
          </Surface>

          <Surface className="p-6">
            <h2 className="text-base font-semibold text-slate-950">
              What happens next
            </h2>
            <ol className="mt-5 space-y-4">
              {[
                "Copy the one-time introspection secret.",
                "Install the AuthSec SDK wrapper.",
                "Publish the tool manifest.",
                "Review tool access before launch.",
              ].map((item, index) => (
                <li key={item} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                    {index + 1}
                  </span>
                  <span className="text-sm leading-6 text-slate-600">{item}</span>
                </li>
              ))}
            </ol>
          </Surface>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
