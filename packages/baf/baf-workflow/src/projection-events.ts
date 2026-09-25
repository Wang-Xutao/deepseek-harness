/**
 * §22.19 R5 — the projection bus's forwarded Host event, in its own leaf
 * module (no imports) so both faces of every consumer — the api-remotes
 * forwarding allowlist and the browser `$on` listener — can load this
 * declaration without dragging the projection domain's other types along.
 */

/**
 * Payload of `baf-workflow/projection-appended`: the host's per-workspace
 * projection bus (§13 R8, now process-global per workspace) forwards one
 * notification per appended event so the web Tab can refresh in real time
 * instead of waiting for a focus/mount pull.
 */
export interface BafWorkflowProjectionAppended {
  /** Workspace root whose projection grew (compare against the session cwd). */
  readonly cwd: string
  /** The change that received the event. */
  readonly changeId: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One projection event was appended in this workspace (host process bus).
     * @mode emit
     * @param payload - workspace cwd + the change that grew.
     */
    'baf-workflow/projection-appended'(payload: BafWorkflowProjectionAppended): void
  }
}
