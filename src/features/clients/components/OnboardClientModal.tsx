import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { useRegisterAiAgentClientMutation, useRegisterClientMutation, useRegisterClawAuthClientMutation, useLazyGetPlatformSelectorsQuery } from "@/app/api/clientApi";
import { SessionManager } from "@/utils/sessionManager";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

type SelectorField = { id: string; key: string; value: string };

interface OnboardClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (clientId: string) => void;
  preventNavigation?: boolean;
}

export function OnboardClientModal({
  isOpen,
  onClose,
  onSuccess,
  preventNavigation = false,
}: OnboardClientModalProps) {
  const navigate = useNavigate();
  const session = SessionManager.getSession();
  const sessionEmail = session?.user?.email || session?.user?.email_id || "";
  const sessionTenantId = session?.tenant_id || "";
  const [clientType, setClientType] = useState<"application" | "ai_agent" | "claw_auth">("application");
  const [clientName, setClientName] = useState("");
  const [platform, setPlatform] = useState("kubernetes");
  const [platformSelectorKeys, setPlatformSelectorKeys] = useState<string[]>([]);
  const [selectors, setSelectors] = useState<SelectorField[]>([
    { id: crypto.randomUUID(), key: "", value: "" },
  ]);
  const [isFetchingSelectors, setIsFetchingSelectors] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState("");
  const [registerClient, { isLoading: isRegisteringApplication }] = useRegisterClientMutation();
  const [registerAiAgentClient, { isLoading: isRegisteringAiAgent }] =
    useRegisterAiAgentClientMutation();
  const [registerClawAuthClient, { isLoading: isRegisteringClawAuth }] =
    useRegisterClawAuthClientMutation();
  const [fetchPlatformSelectors] = useLazyGetPlatformSelectorsQuery();
  const isLoading = isRegisteringApplication || isRegisteringAiAgent || isRegisteringClawAuth;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setClientType("application");
      setClientName("");
      setPlatform("kubernetes");
      setPlatformSelectorKeys([]);
      setSelectors([{ id: crypto.randomUUID(), key: "", value: "" }]);
      setRedirectUrl("");
    }
  }, [isOpen]);

  // Fetch selector keys when platform changes (only when ai_agent type is selected)
  useEffect(() => {
    if (clientType !== "ai_agent" || !session?.tenant_id || !platform) return;
    setIsFetchingSelectors(true);
    fetchPlatformSelectors({ tenant_id: session.tenant_id, platform })
      .unwrap()
      .then((res) => {
        setPlatformSelectorKeys(res.selector_keys);
        setSelectors(
          res.selector_keys.length > 0
            ? res.selector_keys.map((k) => ({ id: crypto.randomUUID(), key: k, value: "" }))
            : [{ id: crypto.randomUUID(), key: "", value: "" }]
        );
      })
      .catch(() => {
        setPlatformSelectorKeys([]);
        setSelectors([{ id: crypto.randomUUID(), key: "", value: "" }]);
      })
      .finally(() => setIsFetchingSelectors(false));
  }, [platform, clientType]);

  const handleAddSelector = () => {
    setSelectors((prev) => [...prev, { id: crypto.randomUUID(), key: "", value: "" }]);
  };

  const handleRemoveSelector = (id: string) => {
    if (selectors.length > 1) {
      setSelectors((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const handleSelectorChange = (id: string, field: "key" | "value", val: string) => {
    setSelectors((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: val } : s)));
  };

  const handleCreateClient = async () => {
    if (!clientName.trim()) {
      toast.error("Please provide a client name");
      return;
    }

    try {
      if (!session?.tenant_id) {
        toast.error("Missing tenant context. Please sign in.");
        return;
      }

      const email = sessionEmail;
      if (!email) {
        toast.error("Missing email from session");
        return;
      }

      const trimmedName = clientName.trim();

      if (clientType === "ai_agent") {
        if (!platform.trim()) {
          toast.error("Please select a platform");
          return;
        }
        const hasValid = selectors.some((s) => s.key.trim() && s.value.trim());
        if (!hasValid) {
          toast.error("Please fill in at least one selector key and value");
          return;
        }
      }

      if (clientType === "claw_auth") {
        if (!redirectUrl.trim()) {
          toast.error("Please provide a redirect URL");
          return;
        }
      }

      let response;
      if (clientType === "ai_agent") {
        const selectorsObj: Record<string, string> = {};
        selectors.forEach((s) => {
          if (s.key.trim() && s.value.trim()) {
            selectorsObj[s.key.trim()] = s.value.trim();
          }
        });
        response = await registerAiAgentClient({
          tenant_id: session.tenant_id,
          name: trimmedName,
          email,
          client_type: "ai_agent",
          agent_type: "mcp-agent",
          platform: platform.trim(),
          selectors: selectorsObj,
        }).unwrap();
      } else if (clientType === "claw_auth") {
        response = await registerClawAuthClient({
          tenant_id: session.tenant_id,
          name: trimmedName,
          email,
          project_id: session.project_id || "00000000-0000-0000-0000-000000000000",
          react_app_url: window.location.hostname,
          client_type: "claw_auth",
          agent_type: "claw_auth",
          redirect_url: redirectUrl.trim(),
        }).unwrap();
      } else {
        response = await registerClient({
          name: trimmedName,
          email,
          tenant_id: session.tenant_id,
          project_id: session.project_id,
          react_app_url: window.location.hostname,
        }).unwrap();
      }

      const successDetail =
        clientType === "ai_agent"
          ? response.spiffe_id || response.client_id
          : response.secret_id || response.client_id;
      const successLabel =
        clientType === "ai_agent" && response.spiffe_id
          ? "SPIFFE ID"
          : clientType === "application" && response.secret_id
            ? "Secret ID"
            : "Client ID";

      const typeLabel =
        clientType === "ai_agent"
          ? "AI agent"
          : clientType === "claw_auth"
            ? "Claw Bot"
            : "MCP server";
      toast.success(`${typeLabel} created. ${successLabel}: ${successDetail}`);

      onClose();
      onSuccess?.(response.client_id);

      if ((clientType === "application" || clientType === "claw_auth") && !preventNavigation) {
        navigate(`/developer/sdk-guides/clients/${response.client_id}`);
      }
    } catch (err: any) {
      console.error(err);
      const msg = err?.data?.message || err?.error || "Failed to create client";
      toast.error(msg);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading && clientName.trim()) {
      handleCreateClient();
    }
  };

  const clientTypeLabel =
    clientType === "ai_agent"
      ? "AI Agent Name"
      : clientType === "claw_auth"
        ? "Claw Bot Name"
        : "MCP Server Name";
  const clientTypePlaceholder =
    clientType === "ai_agent"
      ? "e.g., Customer Support"
      : clientType === "claw_auth"
        ? "e.g., My Claw Bot"
        : "e.g., My MCP Server";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Onboard New Client</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">What do you want to create?</Label>
            <RadioGroup
              value={clientType}
              onValueChange={(value) => setClientType(value as "application" | "ai_agent" | "claw_auth")}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div
                  className={cn(
                    "flex items-start space-x-3 rounded-lg border p-4 cursor-pointer transition-all",
                    clientType === "application" && "border-primary bg-primary/5",
                  )}
                  onClick={() => setClientType("application")}
                >
                  <RadioGroupItem value="application" id="client-type-application" />
                  <div className="flex-1">
                    <Label htmlFor="client-type-application" className="cursor-pointer font-medium">
                      MCP Server
                    </Label>
                  </div>
                </div>

                <div
                  className={cn(
                    "flex items-start space-x-3 rounded-lg border p-4 cursor-pointer transition-all",
                    clientType === "ai_agent" && "border-primary bg-primary/5",
                  )}
                  onClick={() => setClientType("ai_agent")}
                >
                  <RadioGroupItem value="ai_agent" id="client-type-ai-agent" />
                  <div className="flex-1">
                    <Label htmlFor="client-type-ai-agent" className="cursor-pointer font-medium">
                      AI Agent
                    </Label>
                  </div>
                </div>

                <div
                  className={cn(
                    "flex items-start space-x-3 rounded-lg border p-4 cursor-pointer transition-all",
                    clientType === "claw_auth" && "border-primary bg-primary/5",
                  )}
                  onClick={() => setClientType("claw_auth")}
                >
                  <RadioGroupItem value="claw_auth" id="client-type-claw-auth" />
                  <div className="flex-1">
                    <Label htmlFor="client-type-claw-auth" className="cursor-pointer font-medium">
                      Claw Bot
                    </Label>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientName" className="text-sm font-semibold">
              {clientTypeLabel}
            </Label>
            <Input
              id="clientName"
              placeholder={clientTypePlaceholder}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-12 text-base"
              autoFocus
            />
          </div>

          {clientType === "ai_agent" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="platform" className="text-sm font-semibold">
                  Platform
                </Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger id="platform" className="h-12 text-base">
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kubernetes">Kubernetes</SelectItem>
                    <SelectItem value="unix">Unix</SelectItem>
                    <SelectItem value="docker">Docker</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isFetchingSelectors ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading platform fields...
                </div>
              ) : (
                <div className="space-y-3">
                  {selectors.map((selector, index) => (
                    <div key={selector.id} className="flex gap-2 items-start">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          {index === 0 && (
                            <Label className="text-xs font-medium text-foreground uppercase">Key</Label>
                          )}
                          <Input
                            list={`selector-keys-${selector.id}`}
                            value={selector.key}
                            onChange={(e) => handleSelectorChange(selector.id, "key", e.target.value)}
                            placeholder="e.g., k8s:ns"
                            className="h-10 font-mono text-sm"
                          />
                          <datalist id={`selector-keys-${selector.id}`}>
                            {platformSelectorKeys.map((k) => (
                              <option key={k} value={k} />
                            ))}
                          </datalist>
                        </div>
                        <div className="space-y-1.5">
                          {index === 0 && (
                            <Label className="text-xs font-medium text-foreground uppercase">Value</Label>
                          )}
                          <Input
                            value={selector.value}
                            onChange={(e) => handleSelectorChange(selector.id, "value", e.target.value)}
                            placeholder="e.g., production"
                            className="h-10 font-mono text-sm"
                          />
                        </div>
                      </div>
                      {selectors.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveSelector(selector.id)}
                          className={cn("text-destructive hover:text-destructive hover:bg-destructive/10", index === 0 ? "mt-6" : "mt-0")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddSelector}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Selector
                  </Button>
                </div>
              )}
            </div>
          )}

          {clientType === "claw_auth" && (
            <div className="space-y-2">
              <Label htmlFor="redirectUrl" className="text-sm font-semibold">
                Redirect URL
              </Label>
              <Input
                id="redirectUrl"
                placeholder="e.g., https://your-app.com/callback"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                className="h-12 text-base"
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Using tenant <span className="font-mono">{sessionTenantId || "—"}</span> and contact
            email <span className="font-mono">{sessionEmail || "—"}</span>.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateClient}
            disabled={!clientName.trim() || isLoading}
            className="min-w-[140px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Onboarding...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Onboard
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
