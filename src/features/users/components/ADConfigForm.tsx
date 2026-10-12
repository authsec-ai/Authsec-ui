import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export interface ADConfigFormData {
  config_name: string;
  description?: string;
  server: string;
  username: string;
  password: string;
  base_dn: string;
  filter?: string;
  use_ssl?: boolean;
  skip_verify?: boolean;
  sync_interval?: number; // in hours
  attributes?: string; // comma-separated list of attributes to sync
}

interface ADConfigFormProps {
  config: ADConfigFormData;
  onChange: (config: ADConfigFormData) => void;
  touched?: Partial<Record<keyof ADConfigFormData, boolean>>;
  onBlur?: (field: keyof ADConfigFormData) => void;
  errors?: Partial<Record<keyof ADConfigFormData, string>>;
  /** Editing a stored configuration: the password is write-only. */
  isEditing?: boolean;
}

export function ADConfigForm({
  config,
  onChange,
  touched,
  onBlur,
  errors = {},
  isEditing = false,
}: ADConfigFormProps) {
  const updateField = <K extends keyof ADConfigFormData>(
    field: K,
    value: ADConfigFormData[K]
  ) => {
    onChange({ ...config, [field]: value });
  };

  // Without touched tracking, a field's error shows as soon as it is set.
  const isErr = (k: keyof ADConfigFormData) => (!touched || touched[k]) && errors[k];

  return (
    <div className="space-y-3">
      {/* Row 1: Config Name & Description */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="config-name" className="text-sm font-medium">
            Configuration Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="config-name"
            value={config.config_name}
            onChange={(e) => updateField("config_name", e.target.value)}
            onBlur={() => onBlur?.("config_name")}
            aria-invalid={!!isErr("config_name")}
            placeholder="e.g., Main AD Server"
            autoFocus
            className="h-9"
          />
          {isErr("config_name") && (
            <p className="text-xs text-destructive mt-0.5">{errors.config_name}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="config-description" className="text-sm font-medium">
            Description (Optional)
          </Label>
          <Input
            id="config-description"
            value={config.description || ""}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="e.g., Primary Active Directory server"
            className="h-9"
          />
        </div>
      </div>

      {/* Row 2: LDAP Server & Base DN */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ldap-server" className="text-sm font-medium">
            LDAP Server <span className="text-destructive">*</span>
          </Label>
          <Input
            id="ldap-server"
            value={config.server}
            onChange={(e) => updateField("server", e.target.value)}
            onBlur={() => onBlur?.("server")}
            aria-invalid={!!isErr("server")}
            placeholder="dc.company.com:636 or ldap.company.com:389"
            autoComplete="off"
            className="h-9"
          />
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Hostname/IP and port (389 for LDAP, 636 for LDAPS)
          </p>
          {isErr("server") && (
            <p className="text-xs text-destructive mt-0.5">{errors.server}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="ldap-base-dn" className="text-sm font-medium">
            Base Distinguished Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="ldap-base-dn"
            value={config.base_dn}
            onChange={(e) => updateField("base_dn", e.target.value)}
            onBlur={() => onBlur?.("base_dn")}
            aria-invalid={!!isErr("base_dn")}
            placeholder="CN=Users,DC=company,DC=com"
            autoComplete="off"
            className="h-9"
          />
          <p className="text-[11px] text-muted-foreground mt-0.5">
            LDAP path where user objects reside in your directory tree
          </p>
          {isErr("base_dn") && (
            <p className="text-xs text-destructive mt-0.5">{errors.base_dn}</p>
          )}
        </div>
      </div>

      {/* Row 3: Username & Password */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ldap-username" className="text-sm font-medium">
            Authentication Username <span className="text-destructive">*</span>
          </Label>
          {/* Not the console login: keep the browser's saved AuthSec
              credentials out of the service-account fields. */}
          <Input
            id="ldap-username"
            name="ldap-bind-dn"
            data-1p-ignore
            data-lpignore="true"
            value={config.username}
            onChange={(e) => updateField("username", e.target.value)}
            onBlur={() => onBlur?.("username")}
            aria-invalid={!!isErr("username")}
            placeholder="svc-authsec@company.com or CN=svc-authsec,OU=Service,DC=company,DC=com"
            autoComplete="off"
            className="h-9"
          />
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Service account with read access to the directory
          </p>
          {isErr("username") && (
            <p className="text-xs text-destructive mt-0.5">{errors.username}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="ldap-password" className="text-sm font-medium">
            Authentication Password {!isEditing && <span className="text-destructive">*</span>}
          </Label>
          <PasswordInput
            id="ldap-password"
            name="ldap-bind-password"
            data-1p-ignore
            data-lpignore="true"
            value={config.password}
            onChange={(e) => updateField("password", e.target.value)}
            onBlur={() => onBlur?.("password")}
            aria-invalid={!!isErr("password")}
            placeholder={isEditing ? "Leave empty to keep the stored password" : "Service account password"}
            autoComplete="new-password"
            className="h-9"
          />
          {isErr("password") && (
            <p className="text-xs text-destructive mt-0.5">{errors.password}</p>
          )}
        </div>
      </div>

      {/* Row 4: LDAP Filter & Sync Interval */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ldap-filter" className="text-sm font-medium">
            LDAP Filter (Optional)
          </Label>
          <Input
            id="ldap-filter"
            value={config.filter || ""}
            onChange={(e) => updateField("filter", e.target.value)}
            placeholder="(&(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
            autoComplete="off"
            className="h-9"
          />
          <p className="text-[11px] text-muted-foreground mt-0.5">
            LDAP filter to refine which users are synchronized
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="sync-interval" className="text-sm font-medium">
            Sync Interval (Optional)
          </Label>
          <Input
            id="sync-interval"
            type="number"
            min="1"
            max="168"
            value={config.sync_interval || ""}
            onChange={(e) => updateField("sync_interval", e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="24"
            className="h-9"
          />
          <p className="text-[11px] text-muted-foreground mt-0.5">
            How often to sync (in hours, default: 24)
          </p>
        </div>
      </div>

      {/* Row 5: Attributes to Sync */}
      <div className="space-y-1">
        <Label htmlFor="attributes" className="text-sm font-medium">
          Attributes to Sync (Optional)
        </Label>
        <Input
          id="attributes"
          value={config.attributes || ""}
          onChange={(e) => updateField("attributes", e.target.value)}
          placeholder="cn,mail,displayName,memberOf,department,title"
          autoComplete="off"
          className="h-9"
        />
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Comma-separated list of LDAP attributes to synchronize (default: cn, mail, displayName, memberOf)
        </p>
      </div>

      {/* Row 6: SSL Options */}
      <div className="flex items-center gap-6 pt-1">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="use-ssl"
            checked={config.use_ssl ?? false}
            onCheckedChange={(checked) =>
              updateField("use_ssl", checked as boolean)
            }
          />
          <Label htmlFor="use-ssl" className="font-normal cursor-pointer text-sm">
            Use SSL/TLS (LDAPS)
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="skip-verify"
            checked={config.skip_verify ?? false}
            onCheckedChange={(checked) =>
              updateField("skip_verify", checked as boolean)
            }
          />
          <Label htmlFor="skip-verify" className="font-normal cursor-pointer text-sm">
            Skip Certificate Verification
          </Label>
        </div>
      </div>
      {!config.use_ssl && (
        <p role="alert" className="text-xs text-destructive">
          Without LDAPS the service account&apos;s password and directory data
          cross the network unencrypted. Use LDAPS (port 636) unless the link is
          otherwise protected.
        </p>
      )}
      {config.use_ssl && config.skip_verify && (
        <p role="alert" className="text-xs text-destructive">
          Skipping certificate verification lets anyone in the network path
          impersonate the directory server. For testing only; production
          deployments refuse it.
        </p>
      )}
    </div>
  );
}
