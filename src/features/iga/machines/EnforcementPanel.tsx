/**
 * A machine's enforcement from the console, and where its logs can go.
 *
 * Turning enforcement on asks the machine for its own credential: its daemon
 * makes one and hands it over on its next heartbeat (within a minute), and
 * from then on carries out quarantine and release from the console. Nothing
 * secret is shown or copied. Policies apply either way; blocking needs the
 * daemon to run as root.
 */

import { toast } from "react-hot-toast";

import {
  useDisableActuationMutation,
  useEnableActuationMutation,
  type DiscoverySource,
} from "@/app/api/discoveryApi";
import { Button } from "@/components/ui/button";
import { ConnPill } from "@/features/iga/connections/ConnPill";

import { CommandBlock, MUTED } from "./MachineParts";
import { enforcementWord } from "./machinesModel";

export function EnforcementPanel({ source }: { source: DiscoverySource }) {
  const [enable, enabling] = useEnableActuationMutation();
  const [disable, disabling] = useDisableActuationMutation();
  const state = source.actuation_state ?? "off";
  const rt = (source.runtime ?? {}) as {
    enforcement?: string;
    sensor?: string;
  };

  const turnOn = () =>
    void enable(source.id)
      .unwrap()
      .then(() =>
        toast.success(
          "Enforcement turned on. The machine takes it up on its next heartbeat (within a minute).",
        ),
      )
      .catch((e: { status?: number }) =>
        toast.error(
          e.status === 403
            ? "Your role cannot turn enforcement on: it needs governance:admin."
            : "Could not turn enforcement on.",
        ),
      );
  const turnOff = () =>
    void disable(source.id)
      .unwrap()
      .then(() =>
        toast.success(
          "Enforcement turned off. Policies still apply on the machine; console quarantine no longer does.",
        ),
      )
      .catch(
        (e: {
          status?: number;
          data?: { error?: string; quarantined?: number };
        }) =>
          toast.error(
            e.status === 409
              ? "Release the quarantined agents first: the machine could not undo them once enforcement is off."
              : e.status === 403
                ? "Your role cannot turn enforcement off: it needs governance:admin."
                : "Could not turn enforcement off.",
          ),
      );

  return (
    <div className="max-w-3xl space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Quarantine from the console</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ConnPill
            tone={
              state === "on"
                ? "success"
                : state === "pending"
                  ? "warning"
                  : "muted"
            }
          >
            {enforcementWord(source)}
          </ConnPill>
          {state === "off" ? (
            <Button size="sm" onClick={turnOn} disabled={enabling.isLoading}>
              Turn on
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={turnOff}
              disabled={disabling.isLoading}
            >
              Turn off
            </Button>
          )}
        </div>
        <p className={`text-xs ${MUTED}`}>
          On: the machine freezes a quarantined agent and cuts its network, and
          lets it run again on release. The machine makes its own credential for
          this; nothing is copied.
        </p>
        {rt.enforcement ? (
          <p className="text-xs">
            The machine reports: sensor <b>{rt.sensor ?? "unknown"}</b>,
            enforcement <b>{rt.enforcement}</b>.
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Send logs to a SIEM</h3>
        <p className={`text-xs ${MUTED}`}>
          Each machine forwards its records straight to your SIEM, with the same
          OWASP compliance tags as the console's logs: CEF over syslog (UDP, TCP
          or TLS), JSON to a webhook, or Splunk HEC. Run one of these on the
          machine; a token goes in /etc/authsec/siem.env as
          AUTHSEC_SIEM_TOKEN=..., never on the command line.
        </p>
        <CommandBlock
          label="Syslog over TLS (CEF)"
          lines={[
            "sudo authsec-cli daemon install --siem syslog+tls://siem.example.com:6514",
          ]}
        />
        <CommandBlock
          label="Splunk HEC"
          lines={[
            "sudo authsec-cli daemon install --siem splunk+https://splunk.example.com:8088 --siem-token-env AUTHSEC_SIEM_TOKEN",
          ]}
        />
        <CommandBlock
          label="Webhook (JSON)"
          lines={[
            "sudo authsec-cli daemon install --siem webhook+https://hooks.example.com/authsec --siem-token-env AUTHSEC_SIEM_TOKEN",
          ]}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Threats</h3>
        <p className={`text-xs ${MUTED}`}>
          The daemon detects ARTEX and other autonomous attack agents, agents
          starting offensive tools (nmap, sqlmap, nuclei, ...) and connection
          fan-out. To quarantine an agent on a high-severity detection without
          waiting for anyone:
        </p>
        <CommandBlock
          label="Automatic quarantine on threats"
          lines={["sudo authsec-cli daemon install --quarantine-threats"]}
        />
      </section>
    </div>
  );
}
