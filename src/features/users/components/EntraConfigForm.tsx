import React from "react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

export interface EntraConfigFormData {
  config_name: string;
  description?: string;
  workspace_id: string;
  client_id: string;
  client_secret: string;
}

interface EntraConfigFormProps {
  config: EntraConfigFormData;
  onChange: (config: EntraConfigFormData) => void;
  touched?: Partial<Record<keyof EntraConfigFormData, boolean>>;
  onBlur?: (field: keyof EntraConfigFormData) => void;
  errors?: Partial<Record<keyof EntraConfigFormData, string>>;
  /** Editing a stored configuration: the client secret is write-only. */
  isEditing?: boolean;
}

export function EntraConfigForm({
  config,
  onChange,
  touched,
  onBlur,
  errors = {},
  isEditing = false,
}: EntraConfigFormProps) {
  const updateField = <K extends keyof EntraConfigFormData>(
    field: K,
    value: EntraConfigFormData[K]
  ) => {
    onChange({ ...config, [field]: value });
  };

  // Without touched tracking, a field's error shows as soon as it is set.
  const isErr = (k: keyof EntraConfigFormData) => (!touched || touched[k]) && errors[k];

  return (
    <div className="space-y-3">
      {/* Configuration Name and Description in a grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="config-name" className="text-sm">
            Configuration Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="config-name"
            value={config.config_name}
            onChange={(e) => updateField("config_name", e.target.value)}
            onBlur={() => onBlur?.("config_name")}
            aria-invalid={!!isErr("config_name")}
            placeholder="e.g., Azure Production"
            autoFocus
            className="h-9"
          />
          {isErr("config_name") && (
            <p className="text-xs text-destructive">{errors.config_name}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="config-description" className="text-sm">Description (Optional)</Label>
          <Input
            id="config-description"
            value={config.description || ""}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="e.g., Main Azure AD tenant"
            className="h-9"
          />
        </div>
      </div>

      {/* Tenant ID and Client ID in a grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="entra-tenant-id" className="text-sm">
            Directory (tenant) ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="entra-tenant-id"
            value={config.workspace_id}
            onChange={(e) => updateField("workspace_id", e.target.value)}
            onBlur={() => onBlur?.("workspace_id")}
            aria-invalid={!!isErr("workspace_id")}
            placeholder="12345678-1234-5678-9012-123456789012"
            autoComplete="off"
            className="h-9"
          />
          <p className="text-[11px] text-muted-foreground">
            Entra → App registrations → your app → Overview
          </p>
          {isErr("workspace_id") && (
            <p className="text-xs text-destructive">{errors.workspace_id}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="entra-client-id" className="text-sm">
            Application (client) ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="entra-client-id"
            name="entra-application-id"
            data-1p-ignore
            data-lpignore="true"
            value={config.client_id}
            onChange={(e) => updateField("client_id", e.target.value)}
            onBlur={() => onBlur?.("client_id")}
            aria-invalid={!!isErr("client_id")}
            placeholder="87654321-4321-8765-2109-987654321098"
            autoComplete="off"
            className="h-9"
          />
          <p className="text-[11px] text-muted-foreground">
            Same Overview page as the tenant ID
          </p>
          {isErr("client_id") && (
            <p className="text-xs text-destructive">{errors.client_id}</p>
          )}
        </div>
      </div>

      {/* Client Secret - full width */}
      <div className="space-y-1.5">
        <Label htmlFor="entra-client-secret" className="text-sm">
          Client secret value {!isEditing && <span className="text-destructive">*</span>}
        </Label>
        <PasswordInput
          id="entra-client-secret"
          name="entra-client-secret"
          data-1p-ignore
          data-lpignore="true"
          value={config.client_secret}
          onChange={(e) => updateField("client_secret", e.target.value)}
          onBlur={() => onBlur?.("client_secret")}
          aria-invalid={!!isErr("client_secret")}
          placeholder={isEditing ? "Leave empty to keep the stored secret" : "Certificates & secrets → Value"}
          autoComplete="new-password"
          className="h-9"
        />
        <p className="text-[11px] text-muted-foreground">
          The Value column, not the Secret ID. The app registration needs the
          Microsoft Graph application permission User.Read.All with admin
          consent. This can be a different app registration from the one used
          for &ldquo;Sign in with Microsoft&rdquo;.
        </p>
        {isErr("client_secret") && (
          <p className="text-xs text-destructive">{errors.client_secret}</p>
        )}
      </div>
    </div>
  );
}
