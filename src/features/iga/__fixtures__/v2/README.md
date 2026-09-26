# TRD 2 v2 reader fixtures

Source: authsec `experimental` @ `6a7beccbb4042e1f7a89bfae8c474a1dd9e0a69c`.

JSON shapes follow:

- `internal/igaread/runtime_read.go` (`RuntimeInstanceView`, `ObservedAccessGroup`, `ObservedAccessEvent`, `ObservedUse`, `RuntimePolicyStatus`)
- `internal/igaread/traverse.go` (`GraphEdge`, `GraphNode`)
- `internal/igaread/graph_v2.go` (`labelV2Edge`, `fillGrantHonesty`, `fillResourceFacts`)
- `internal/igaread/envelope.go` (list and detail meta, `graph_revision`)
- `controllers/platform/iga_graph_read_controller.go` (`graph_v2` on `/capabilities`)
- `internal/igaread/coverage.go` `appendIntegrationCoverage` and `pipeline.go` `pipelineIntegrations`
- `services/collector_enrollment_service.go` `CollectorView`
- `tests/integration/trd2_a5p2_graph_readers_test.go` (observed access keeps database SQL and drops bare SQL; directory backing is `directory_backing`; Kubernetes grants are `partial` / `unknown`; ended runtimes use `ttl_basis: runtime_unobserved`; policy status is `not_configured`)

`collector_id` on coverage and pipeline rows is not returned by that server yet. The UI reads it when present. The gap is a server proposal in the WP-U1a PR.
