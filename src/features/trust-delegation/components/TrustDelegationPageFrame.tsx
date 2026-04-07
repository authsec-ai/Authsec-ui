import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";

interface TrustDelegationPageFrameProps {
  title: string;
  description: string;
  actions?: ReactNode;
  backTo?: string;
  children: ReactNode;
}

export function TrustDelegationPageFrame({
  title,
  description,
  actions,
  backTo,
  children,
}: TrustDelegationPageFrameProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <div className="space-y-4 p-6 max-w-10xl mx-auto">
        <PageHeader
          title={title}
          description={description}
          actions={actions}
          backButton={
            backTo ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(backTo)}
                className="h-8 w-8 p-0 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : undefined
          }
        />
        {children}
      </div>
    </div>
  );
}
