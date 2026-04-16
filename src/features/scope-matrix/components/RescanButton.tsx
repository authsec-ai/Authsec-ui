import { RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { useRescanResourceServerMutation } from "@/app/api/scopeMatrixApi";

interface RescanButtonProps {
  rsId: string;
}

export function RescanButton({ rsId }: RescanButtonProps) {
  const [rescanResourceServer, { isLoading }] = useRescanResourceServerMutation();

  const handleRescan = async () => {
    try {
      await rescanResourceServer(rsId).unwrap();
      toast.success("Resource server rescanned successfully");
    } catch (error) {
      toast.error("Failed to rescan resource server");
      console.error("Rescan error:", error);
    }
  };

  return (
    <Button
      onClick={handleRescan}
      disabled={isLoading}
      variant="outline"
      size="default"
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
      {isLoading ? "Rescanning..." : "Rescan"}
    </Button>
  );
}
