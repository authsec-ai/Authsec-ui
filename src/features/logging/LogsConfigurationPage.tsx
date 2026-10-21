import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConsolePage } from "../../components/console/ConsolePage";
import { Button } from "../../components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "../../components/ui/alert";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../../components/ui/tabs";
import { CheckCircle, X } from "lucide-react";
import {
  useConfigureLogServiceMutation,
  useGetLogConfigurationStatusQuery,
} from "../../app/api/logsApi";
import { toast } from "../../lib/toast";
import { buildHostString } from "../../utils/validation";
import {
  SplunkConfiguration,
  // HttpConfiguration,  // Commented for future use
  SyslogConfiguration,
  ElasticsearchConfiguration,
  FluentbitConfiguration,
  ConfigurationOverview,
  ConfigurationStatus,
} from "./components/configuration";

export function LogsConfigurationPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [banner, setBanner] = useState<null | {
    title: string;
    description?: string;
  }>(null);

  const workspaceId = (() => {
    try {
      const session = JSON.parse(
        localStorage.getItem("authsec_session_v2") || "{}"
      );
      return session?.workspace_id || "";
    } catch {
      return "";
    }
  })();

  const { data: configStatus, isLoading: isStatusLoading } =
    useGetLogConfigurationStatusQuery(
      { workspace_id: workspaceId },
      { skip: !workspaceId }
    );

  const [configureLogService, { isLoading: isConfiguring }] =
    useConfigureLogServiceMutation();

  const [splunkConfig, setSplunkConfig] = useState({
    workspace_id: "",
    host: "",
    port: "",
  });

  /*
  // HTTP Configuration - Commented for future use
  const [httpConfig, setHttpConfig] = useState({
    workspace_id: "",
    host: "",
    port: "",
  });
  */

  const [fluentbitConfig, setFluentbitConfig] = useState({
    workspace_id: "",
    host: "",
    port: "",
  });

  const [syslogConfig, setSyslogConfig] = useState({
    workspace_id: "",
    host: "",
    port: "",
  });

  const [elasticsearchConfig, setElasticsearchConfig] = useState({
    workspace_id: "",
    host: "",
    port: "",
  });

  // Unified save handler factory
  const createSaveHandler = (
    name: "splunk" | "fluentbit" | "elasticsearch" | "syslog",
    config: { workspace_id: string; host: string; port: string }
  ) => {
    return async () => {
      try {
        // Build host string (adds :port for IPs)
        const hostString = buildHostString(config.host, config.port);

        await configureLogService({
          host: hostString,
          workspace_id: config.workspace_id,
          name,
        }).unwrap();

        setBanner({
          title: `${
            name.charAt(0).toUpperCase() + name.slice(1)
          } configured successfully!`,
          description: "Your log forwarding settings have been updated.",
        });

        toast.success(
          `${
            name.charAt(0).toUpperCase() + name.slice(1)
          } configured successfully.`
        );

        setActiveTab("overview");
      } catch (error: any) {
        toast.error(error?.data?.message || `Failed to configure ${name}.`);
      }
    };
  };

  // Create handlers for each service
  const handleSplunkSave = createSaveHandler("splunk", splunkConfig);
  const handleFluentbitSave = createSaveHandler("fluentbit", fluentbitConfig);
  const handleSyslogSave = createSaveHandler("syslog", syslogConfig);
  const handleElasticsearchSave = createSaveHandler(
    "elasticsearch",
    elasticsearchConfig
  );

  const handleCancel = () => {
    navigate("/logs");
  };

  return (
    <ConsolePage
      title="Log forwarding"
      description="Send your logs to Splunk, Syslog, Elasticsearch or Fluent Bit."
    >
      {banner && (
        <div>
          <Alert className="relative border border-emerald-500/30 bg-emerald-500/5 backdrop-blur-sm">
            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            <AlertTitle className="text-slate-900 dark:text-zinc-100">
              {banner.title}
            </AlertTitle>
            {banner.description && (
              <AlertDescription className="text-sm text-slate-700 dark:text-zinc-400">
                {banner.description}
              </AlertDescription>
            )}
            <div className="mt-3 flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => {
                  setBanner(null);
                  navigate("/logs");
                }}
              >
                View Logs
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setBanner(null)}>
                Dismiss
              </Button>
            </div>
            <button
              className="absolute right-3 top-3 text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-200"
              onClick={() => setBanner(null)}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </Alert>
        </div>
      )}

      <div className="w-full space-y-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex w-full flex-wrap gap-2 rounded-full border border-slate-200 dark:border-neutral-800/70 bg-slate-50 dark:bg-neutral-950/70 p-1 mb-8">
            <TabsTrigger
              value="overview"
              className="flex-1 rounded-full px-4 py-2 text-sm font-medium text-slate-600 dark:text-zinc-500 transition data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900/80 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-200"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="splunk"
              className="flex-1 rounded-full px-4 py-2 text-sm font-medium text-slate-600 dark:text-zinc-500 transition data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900/80 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-200"
            >
              Splunk
            </TabsTrigger>
            {/* HTTP Tab - Commented for future use
            <TabsTrigger
              value="http"
              className="flex-1 rounded-full px-4 py-2 text-sm font-medium text-slate-600 dark:text-zinc-500 transition data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900/80 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-200"
            >
              HTTP
            </TabsTrigger>
            */}
            <TabsTrigger
              value="fluentbit"
              className="flex-1 rounded-full px-4 py-2 text-sm font-medium text-slate-600 dark:text-zinc-500 transition data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900/80 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-200"
            >
              Fluent Bit
            </TabsTrigger>
            <TabsTrigger
              value="syslog"
              className="flex-1 rounded-full px-4 py-2 text-sm font-medium text-slate-600 dark:text-zinc-500 transition data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900/80 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-200"
            >
              Syslog
            </TabsTrigger>
            <TabsTrigger
              value="elasticsearch"
              className="flex-1 rounded-full px-4 py-2 text-sm font-medium text-slate-600 dark:text-zinc-500 transition data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900/80 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-200"
            >
              Elasticsearch
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ConfigurationOverview
                  onTabChange={setActiveTab}
                  configuredServices={
                    configStatus ?? {
                      splunk: false,
                      fluentbit: false,
                      syslog: false,
                      elasticsearch: false,
                    }
                  }
                />
              </div>
              <div>
                <ConfigurationStatus
                  configStatus={
                    configStatus ?? {
                      splunk: false,
                      fluentbit: false,
                      syslog: false,
                      elasticsearch: false,
                    }
                  }
                  isLoading={isStatusLoading}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="splunk" className="space-y-8">
            <SplunkConfiguration
              config={splunkConfig}
              onChange={setSplunkConfig}
              onSave={handleSplunkSave}
              onCancel={handleCancel}
              isLoading={isConfiguring}
            />
          </TabsContent>

          {/* HTTP Tab Content - Commented for future use
          <TabsContent value="http" className="space-y-8">
            <HttpConfiguration
              config={httpConfig}
              onChange={setHttpConfig}
              onSave={handleSaveConfiguration}
              onCancel={handleCancel}
            />
          </TabsContent>
          */}

          <TabsContent value="fluentbit" className="space-y-8">
            <FluentbitConfiguration
              config={fluentbitConfig}
              onChange={setFluentbitConfig}
              onSave={handleFluentbitSave}
              onCancel={handleCancel}
              isLoading={isConfiguring}
            />
          </TabsContent>

          <TabsContent value="syslog" className="space-y-8">
            <SyslogConfiguration
              config={syslogConfig}
              onChange={setSyslogConfig}
              onSave={handleSyslogSave}
              onCancel={handleCancel}
              isLoading={isConfiguring}
            />
          </TabsContent>

          <TabsContent value="elasticsearch" className="space-y-8">
            <ElasticsearchConfiguration
              config={elasticsearchConfig}
              onChange={setElasticsearchConfig}
              onSave={handleElasticsearchSave}
              onCancel={handleCancel}
              isLoading={isConfiguring}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ConsolePage>
  );
}
