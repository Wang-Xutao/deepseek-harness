/**
 * Product-default baseline YAML used when the workspace has no `.baf/baseline.yml`.
 * Mirrors the scaffold template so settings can still show enterprise policy.
 */

/** Scaffold-equivalent baseline text for settings fallback display. */
export const DEFAULT_BASELINE_YAML = `# BAF workspace baseline (product default for settings preview).
schema: 1
baselineId: baf-baseline-product-default
bafCompatibility:
  min: 0.1.0
  max: 0.x
workflow:
  default: go
  requireOpenSpec: true
  bugFixPath:
    allowed: true
    maxScope: small-local
    requireRegressionTest: true
routeProfile:
  default:
    provider: <enterprise-tbd>
    model: <enterprise-tbd>
  allowed:
    - provider: <enterprise-tbd>
      model: <enterprise-tbd>
      capabilities: [reasoning, coding, structured-output, long-context, tool-use, low-latency]
      fallbackGroup: primary
  phases:
    intake: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    open: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    clarify: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    design: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    plan: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    implement: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    verify: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
    archive: { provider: <enterprise-tbd>, model: <enterprise-tbd> }
  fallbackPolicy:
    mode: approved-only
    groups:
      primary:
        - provider: <enterprise-tbd>
          model: <enterprise-tbd>
openspec:
  cli: <enterprise-tbd>
  version: latest
  root: openspec
  changeRoot: openspec/changes
  validate:
    args: [<enterprise-tbd>]
standard:
  mattPocockRulesRef: .baf/standards/default-rules.md
stack:
  language: c
  compiler: gcc
  build: <enterprise-tbd>
  test: <enterprise-tbd>
  coverage:
    required: true
    minimum: project-config
  analyzers:
    - <enterprise-tbd>
guard:
  secretScan: required
  protectedPaths:
    - <enterprise-tbd>
  requireHumanConfirmation:
    - scaffold
    - archive
    - abandon
userOverridePolicy:
  bugFixPathAllowed: true
  bugFixPathMaxScope: true
  coverageMinimum: true
  projectionGitignore: true
  verifyNotes: true
  changeSlugPrefix: true
`
