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
import { Plus, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  useRegisterAiAgentClientMutation,
  useRegisterClientMutation,
} from "@/app/api/clientApi";
import { SessionManager } from "@/utils/sessionManager";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

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
  const [clientType, setClientType] = useState<"application" | "ai_agent">(
    "application",
  );
  const [clientName, setClientName] = useState("");
  const [platform, setPlatform] = useState("kubernetes");
  const [namespace, setNamespace] = useState("authsec-prod");
  const [serviceAccount, setServiceAccount] = useState("agent");
  const [registerClient, { isLoading: isRegisteringApplication }] =
    useRegisterClientMutation();
  const [registerAiAgentClient, { isLoading: isRegisteringAiAgent }] =
    useRegisterAiAgentClientMutation();
  const isLoading = isRegisteringApplication || isRegisteringAiAgent;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setClientType("application");
      setClientName("");
      setPlatform("kubernetes");
      setNamespace("authsec-prod");
      setServiceAccount("agent");
    }
  }, [isOpen]);

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

        if (!namespace.trim() || !serviceAccount.trim()) {
          toast.error("Please provide namespace and service account");
          return;
        }
      }

      const response =
        clientType === "ai_agent"
          ? await registerAiAgentClient({
              tenant_id: session.tenant_id,
              name: trimmedName,
              email,
              client_type: "ai_agent",
              agent_type: "mcp-agent",
              platform: platform.trim(),
              platform_config: {
                namespace: namespace.trim(),
                service_account: serviceAccount.trim(),
              },
            }).unwrap()
          : await registerClient({
              name: trimmedName,
              email,
              tenant_id: session.tenant_id,
            }).unwrap();

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

      toast.success(
        clientType === "ai_agent"
          ? `AI agent created. ${successLabel}: ${successDetail}`
          : `MCP server created. ${successLabel}: ${successDetail}`,
      );

      onClose();
      onSuccess?.(response.client_id);

      if (clientType === "application" && !preventNavigation) {
        navigate(`/sdk/clients/${response.client_id}`);
      }
    } catch (err: any) {
      console.error(err);
      const msg = err?.data?.message || err?.error || "Failed to create client";
      toast.error(msg);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading && clientName.trim()) {
      handleCreateClient();
    }
  };

  const clientTypeLabel =
    clientType === "ai_agent" ? "AI Agent Name" : "MCP Server Name";
  const clientTypePlaceholder =
    clientType === "ai_agent"
      ? "e.g., Customer Support"
      : "e.g., My MCP Server";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Onboard New Client
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              What do you want to create?
            </Label>
            <RadioGroup
              value={clientType}
              onValueChange={(value) =>
                setClientType(value as "application" | "ai_agent")
              }
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div
                  className={cn(
                    "flex items-start space-x-3 rounded-lg border p-4 cursor-pointer transition-all",
                    clientType === "application" && "border-primary bg-primary/5",
                  )}
                  onClick={() => setClientType("application")}
                >
                  <RadioGroupItem value="application" id="client-type-application" />
                  <div className="flex-1">
                    <Label
                      htmlFor="client-type-application"
                      className="cursor-pointer font-medium"
                    >
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
                    <Label
                      htmlFor="client-type-ai-agent"
                      className="cursor-pointer font-medium"
                    >
                      AI Agent
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
              onKeyPress={handleKeyPress}
              className="h-12 text-base"
              autoFocus
            />
          </div>

          {clientType === "ai_agent" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="platform" className="text-sm font-semibold">
                  Platform
                </Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger id="platform" className="h-12 text-base">
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kubernetes">Kubernetes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="namespace" className="text-sm font-semibold">
                  Namespace
                </Label>
                <Input
                  id="namespace"
                  placeholder="e.g., authsec-prod"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  className="h-12 text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serviceAccount" className="text-sm font-semibold">
                  Service Account
                </Label>
                <Input
                  id="serviceAccount"
                  placeholder="e.g., agent"
                  value={serviceAccount}
                  onChange={(e) => setServiceAccount(e.target.value)}
                  className="h-12 text-base"
                />
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Using tenant <span className="font-mono">{sessionTenantId || "—"}</span> and
            contact email <span className="font-mono">{sessionEmail || "—"}</span>.
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
