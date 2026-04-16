import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Trash2 } from "lucide-react";
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
import {
  useListResourceServerScopesQuery,
  useUpdateScopeMutation,
  useDeleteScopeMutation,
} from "@/app/api/scopeMatrixApi";
import type { RiskLevel } from "@/app/api/types/scopeMatrix";

interface ScopeDetailModalProps {
  scopeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rsId: string;
}

const riskLevels: RiskLevel[] = ["low", "medium", "high", "critical"];

export function ScopeDetailModal({ scopeId, open, onOpenChange, rsId }: ScopeDetailModalProps) {
  const { data: scopes } = useListResourceServerScopesQuery(rsId);
  const [updateScope, { isLoading: isUpdating }] = useUpdateScopeMutation();
  const [deleteScope, { isLoading: isDeleting }] = useDeleteScopeMutation();

  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");
  const [icon, setIcon] = useState("");

  const scope = scopes?.find((s) => s.id === scopeId);

  useEffect(() => {
    if (scope) {
      setDisplayName(scope.display_name || "");
      setDescription(scope.description || "");
      setRiskLevel(scope.risk_level);
      setIcon(scope.icon || "");
    }
  }, [scope]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scopeId) return;

    try {
      await updateScope({
        scopeId,
        body: {
          display_name: displayName,
          description: description || undefined,
          risk_level: riskLevel,
          icon: icon || undefined,
        },
      }).unwrap();
      toast.success("Scope updated successfully");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to update scope");
      console.error("Update scope error:", error);
    }
  };

  const handleDelete = async () => {
    if (!scopeId) return;
    if (!confirm("Are you sure you want to delete this scope? This action cannot be undone.")) {
      return;
    }

    try {
      await deleteScope(scopeId).unwrap();
      toast.success("Scope deleted successfully");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to delete scope");
      console.error("Delete scope error:", error);
    }
  };

  if (!scope) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Edit Scope</DialogTitle>
          <DialogDescription>
            Update the details for scope: <strong>{scope.scope_string}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="scope-string">Scope String</Label>
              <Input
                id="scope-string"
                value={scope.scope_string}
                disabled
                className="bg-muted"
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

            <div className="space-y-2">
              <Label htmlFor="icon">Icon</Label>
              <Input
                id="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="Enter icon name or emoji"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || isUpdating}
              className="sm:mr-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isUpdating || isDeleting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isUpdating || isDeleting}>
              {isUpdating ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
