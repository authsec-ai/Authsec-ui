# AuthSec Application UX Masterplan

## Product Frame

AuthSec is launch control for agentic resource servers. A customer registers an MCP server or API, installs the SDK at the boundary, lets AuthSec receive tool inventory, maps tools to AuthSec scopes, packages scopes into roles, grants default or exception access, tests readiness, and activates only when the backend gates pass.

The UI must make that sequence obvious. It should not look like a generic CRUD admin console.

## Core Journey

1. Register the protected endpoint.
2. Copy the one-time secret and install the SDK.
3. Verify protected-resource metadata, bearer challenge, and SDK manifest.
4. Discover tools from SDK manifest first, authenticated scan second, manual entry last.
5. Map every private tool to one or more scopes. Suggestions stay advisory until an admin applies them.
6. Choose default access and manual exceptions.
7. Review OAuth clients.
8. Run the available readiness test.
9. Launch after the backend checklist passes.
10. Monitor drift after activation.

## Information Architecture

Application detail should use one compact workspace navigation, not a readiness bar plus separate tabs. Each workspace item can carry its readiness state inline:

- Overview
- SDK
- Tools
- Access
- Clients
- Test
- Launch
- Activity

The global sidebar should stay task-oriented:

- Protect: Applications, Clients, AI Agents
- Access: Users, Roles, Permissions, Assignments, Consent Grants
- Configure: Identity Providers, Trust Delegation, Secrets, SDK Guides
- Monitor: Audit Logs

## Screen Direction

- Applications list: show application identity, compact readiness summary, and next action. Avoid wide status pills that force horizontal scroll.
- Create application: ask only endpoint identity and client connection modes. Keep scope templates optional and explicitly non-granting.
- SDK setup: make the one-time secret compact and dismissible after acknowledgement. Lead with the coding-agent prompt and show env/config as copyable implementation artifacts.
- Tools: treat this as a policy workbench. Search, filter, inspect, bulk-map, and distinguish suggested policy from runtime-effective admin overrides.
- Access: present default access as the scalable baseline, manual bindings as exceptions, and activation preview as concise stats plus scope chips.
- Test: be honest that current backend only supports readiness test-login, not user x client x tool simulation.
- Launch: present backend-enforced gates with direct fix actions. Activation should feel like a review checklist, not a huge warning page.
- Activity: drift events now; runtime denied-call metrics later when backend endpoints exist.

## Backend Gaps For Later

- Scenario simulator: user, client, requested scopes, and tool target with an explainable allow/deny tree.
- Bulk mapping and bulk assignment dry-run/commit APIs.
- RS-specific role create/edit/clone/archive endpoints with effective-tools preview.
- Runtime activity endpoints for denied calls, policy health, insufficient-scope errors, and SDK policy fetch status.
- More detailed SDK validation response including parsed metadata fields and manifest summary.

## First-Pass UI Changes

- Collapse double application navigation into one readiness-aware workspace nav.
- Reduce applications table width by replacing separate status columns with one readiness summary.
- Replace the create page shell with a quieter three-column setup surface.
- Make the SDK secret banner compact and collapsible.
- Add tool search and left-aligned filters.
- Tighten access activation preview into operational stats.
- Make launch status banner compact.
