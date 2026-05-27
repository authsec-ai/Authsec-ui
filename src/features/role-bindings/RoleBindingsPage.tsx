import React, { useState, useMemo, useEffect } from "react";
import { useRbacAudience } from "@/contexts/RbacAudienceContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Plus } from "lucide-react";
import { RoleBindingsTable } from "./components/RoleBindingsTable";
import { Button } from "@/components/ui/button";
import { ConsoleFilterBar } from "@/components/console/iam-console";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

/**
 * Role Bindings page component - Visualize RBAC role bindings
 *
 * Features:
 * - Role bindings with user/role details
 * - Search and filter capabilities
 * - Optional filters: user_id, role_id, scope_type
 * - RBAC audience support (admin vs end-user)
 */
export function RoleBindingsPage() {
  const { isAdmin, audience } = useRbacAudience();
  const location = useLocation();
  const standardNavigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [roleScopeSearch, setRoleScopeSearch] = useState("");
  const [mapModalOpen, setMapModalOpen] = useState(false);

  // Auto-open modal if query param present (from wizard)
  useEffect(() => {
    if (searchParams.get("openModal") === "create") {
      setMapModalOpen(true);
      // Clean up query param while preserving location state
      searchParams.delete("openModal");
      setSearchParams(searchParams, { replace: true, state: location.state });
    }
  }, [searchParams, setSearchParams, location.state]);

  // Handle modal close with wizard awareness
  const handleBindingModalSuccess = () => {
    // Don't close modal here - it will be closed by onOpenChange
    // If coming from wizard, navigate back to root with success flag
    if (location.state?.fromWizard) {
      standardNavigate("/", { state: { bindingCreated: true } });
    }
  };

  // Copy based on audience
  const copy = useMemo(
    () => ({
      title: "Role Bindings",
      description: isAdmin
        ? "Application-role assignments that decide who can invoke protected MCP capabilities."
        : "Application-role assignments for users in your organization.",
      buttonText: "Create binding",
    }),
    [isAdmin],
  );

  return (
    <div className="min-h-screen">
      <div className="space-y-4 p-6 max-w-10xl mx-auto">
        <PageHeader
          title={copy.title}
          description={copy.description}
          actions={
            <Button
              onClick={() => setMapModalOpen(true)}
              data-tour-id="create-binding-button"
            >
              <Plus className="mr-2 h-4 w-4" />
              {copy.buttonText}
            </Button>
          }
        />

        <div data-tour-id="bindings-filters">
          <ConsoleFilterBar
            search={roleScopeSearch}
            onSearchChange={setRoleScopeSearch}
            searchPlaceholder="Search users, applications, roles, or sources"
            trailing={
              roleScopeSearch.trim() ? (
                <Button variant="ghost" size="sm" onClick={() => setRoleScopeSearch("")}>
                  Clear
                </Button>
              ) : null
            }
          />
        </div>

        <div data-tour-id="bindings-table">
          <RoleBindingsTable
            searchQuery={roleScopeSearch}
            isMapModalOpen={mapModalOpen}
            onMapModalOpenChange={setMapModalOpen}
            onBindingSuccess={handleBindingModalSuccess}
            audience={audience}
          />
        </div>
      </div>
    </div>
  );
}
