import { useState } from "react";
import { toast } from "react-hot-toast";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateResourceServerScopeMutation } from "@/app/api/scopeMatrixApi";
import type { RiskLevel } from "@/app/api/types/scopeMatrix";

interface CreateScopeModalProps {
  rsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const riskLevels: RiskLevel[] = ["low", "medium", "high", "critical"];

export function CreateScopeModal({ rsId, open, onOpenChange }: CreateScopeModalProps) {
  const [createScope, { isLoading }] = useCreateResourceServerScopeMutation();

  const [scopeString, setScopeString] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");

  const resetForm = () => {
    setScopeString("");
    setDisplayName("");
    setDescription("");
    setRiskLevel("low");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!scopeString.trim()) {
      toast.error("Scope string is required");
      return;
    }

    try {
      await createScope({
        rsId,
        body: {
          scope_string: scopeString.trim(),
          display_name: displayName.trim(),
          description: description.trim() || undefined,
          risk_level: riskLevel,
        },
      }).unwrap();
      toast.success("Scope created successfully");
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to create scope");
      console.error("Create scope error:", error);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Create New Scope</DialogTitle>
          <DialogDescription>
            Add a new OAuth scope to this resource server.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="scope-string">
                Scope String <span className="text-destructive">*</span>
              </Label>
              <Input
                id="scope-string"
                value={scopeString}
                onChange={(e) => setScopeString(e.target.value)}
                placeholder="e.g., read:users"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter display name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="risk-level">Risk Level</Label>
              <Select value={riskLevel} onValueChange={(value) => setRiskLevel(value as RiskLevel)}>
                <SelectTrigger id="risk-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {riskLevels.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Scope"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
