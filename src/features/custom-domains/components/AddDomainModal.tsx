import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Globe, Loader2, AlertCircle } from "lucide-react";
import { useCreateDomainMutation } from "@/app/api/domainApi";
import { SessionManager } from "@/utils/sessionManager";
import { toast } from "@/lib/toast";
import { domainNameError } from "../domainValidation";

interface AddDomainModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDomainModal({ open, onOpenChange }: AddDomainModalProps) {
  const [domain, setDomain] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [createDomain, { isLoading }] = useCreateDomainMutation();

  const validateDomain = domainNameError;
  const liveError = domain.trim() ? validateDomain(domain) : null;

  const handleDomainChange = (value: string) => {
    setDomain(value);
    setValidationError(value.trim() ? validateDomain(value) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const error = validateDomain(domain);
    if (error) {
      setValidationError(error);
      return;
    }

    const session = SessionManager.getSession();
    if (!session?.workspace_id) {
      toast.error("Session expired. Please log in again.");
      return;
    }

    try {
      await createDomain({
        workspace_id: session.workspace_id,
        domain: domain.trim().toLowerCase(),
        is_primary: isPrimary,
      }).unwrap();

      toast.success(
        "Domain added successfully! Please configure the DNS records to verify ownership.",
      );

      // Reset form and close modal
      setDomain("");
      setIsPrimary(false);
      setValidationError(null);
      onOpenChange(false);
    } catch (error: any) {
      const message =
        error?.data?.error ||
        error?.data?.message ||
        "Failed to add domain. Please try again.";
      toast.error(message);
    }
  };

  const handleClose = () => {
    setDomain("");
    setIsPrimary(false);
    setValidationError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Add Custom Domain
          </DialogTitle>
          <DialogDescription>
            Add a custom domain for branded authentication experiences. You'll
            need to verify domain ownership via DNS records.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          {/* Domain Name Input */}
          <div className="space-y-2">
            <Label htmlFor="domain">
              Domain Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="domain"
              placeholder="auth.example.com"
              value={domain}
              onChange={(e) => handleDomainChange(e.target.value)}
              className={validationError ? "border-destructive" : ""}
              disabled={isLoading}
            />
            {validationError ? (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {validationError}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Enter your fully qualified domain name (e.g., auth.example.com)
              </p>
            )}
          </div>

          {/* Set as Primary Checkbox */}
          <div className="flex items-start space-x-3">
            <Checkbox
              id="isPrimary"
              checked={isPrimary}
              onCheckedChange={(checked) => setIsPrimary(checked === true)}
              disabled={isLoading}
            />
            <div className="space-y-1">
              <Label
                htmlFor="isPrimary"
                className="text-sm font-medium cursor-pointer"
              >
                Set as primary domain
              </Label>
              <p className="text-xs text-muted-foreground">
                The primary domain will be used as the default for
                authentication flows. Only verified domains can be set as
                primary.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !domain.trim() || !!liveError}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Domain"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
