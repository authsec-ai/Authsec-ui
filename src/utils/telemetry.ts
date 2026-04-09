import { SeverityNumber } from "@opentelemetry/api-logs";
import { LoggerProvider, BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { ErrorInfo } from "react";

/**
 * OpenTelemetry Logs instrumentation for browser JS runtime errors.
 * Sends structured error logs via OTLP/HTTP to the OTEL collector,
 * which routes them to Loki for querying in Grafana.
 *
 * Pipeline: window.onerror → LoggerProvider → OTLPLogExporter → Collector → Loki → Grafana
 */

let logger: ReturnType<LoggerProvider["getLogger"]> | null = null;

/**
 * Initialize the OpenTelemetry log pipeline.
 * Call once at app startup with the OTEL collector base URL.
 * @param endpoint - Base URL of the OTEL collector (e.g. https://otel.example.com)
 */
export function initTelemetry(endpoint: string): void {
  try {
    const exporter = new OTLPLogExporter({
      url: `${endpoint}/v1/logs`,
    });

    const provider = new LoggerProvider({
      resource: resourceFromAttributes({
        "service.name": "authnull-ui",
        "service.version": "1.0.0",
        "deployment.environment": import.meta.env.MODE,
      }),
      processors: [new BatchLogRecordProcessor(exporter)],
    });

    logger = provider.getLogger("frontend-error-logger", "1.0.0");
  } catch (err) {
    console.error("[Telemetry] Failed to initialize:", err);
  }
}

/**
 * Send a JS runtime error (from window.onerror) to the OTEL collector.
 * Safe to call even before initTelemetry — will no-op if not initialized.
 */
export function logJSError(event: ErrorEvent): void {
  if (!logger) return;
  try {
    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
      body: `FRONTEND_JS_RUNTIME_ERROR: ${event.message || "Unknown JS runtime error"}`,
      attributes: {
        "error.type": event.error?.name ?? "Error",
        "error.message": event.message,
        "error.stack": event.error?.stack ?? "",
        "error.filename": event.filename,
        "error.lineno": event.lineno,
        "error.colno": event.colno,
        "page.url": window.location.href,
        "page.path": window.location.pathname,
        "browser.user_agent": navigator.userAgent,
        "source": "window.onerror",
      },
    });
  } catch (err) {
    console.error("[Telemetry] Failed to log JS error:", err);
  }
}

/**
 * Send a React component tree error (from ErrorBoundary.componentDidCatch) to the OTEL collector.
 * Safe to call even before initTelemetry — will no-op if not initialized.
 */
export function logReactError(error: Error, errorInfo: ErrorInfo): void {
  if (!logger) return;
  try {
    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
      body: error.message || "Unknown React component error",
      attributes: {
        "error.type": error.name,
        "error.message": error.message,
        "error.stack": error.stack ?? "",
        "error.component_stack": errorInfo.componentStack ?? "",
        "page.url": window.location.href,
        "page.path": window.location.pathname,
        "browser.user_agent": navigator.userAgent,
        "source": "react.error_boundary",
      },
    });
  } catch (err) {
    console.error("[Telemetry] Failed to log React error:", err);
  }
}
