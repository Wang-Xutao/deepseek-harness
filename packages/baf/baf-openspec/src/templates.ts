/**
 * English skeleton bodies for OpenSpec change documents.
 * Templates are data; handlers fill the marked TODO sections.
 * @module @deepseek-ai/dsh-baf-openspec/templates
 */

/** Build the proposal template body. */
export function proposalTemplate(changeId: string, title: string): string {
  return `# ${title}

Change id: ${changeId}

## Why

TODO: one paragraph on the user goal and the problem this change solves.

## Scope

TODO: bullet list of what is in scope and what is explicitly out of scope.

## Impact

TODO: expected affected modules, public API impact, and rollback difficulty.
`
}

/** Build the clarify template body. */
export function clarifyTemplate(changeId: string): string {
  return `# Clarify — ${changeId}

## Blocking questions

TODO: one entry per blocking question, each with:

- Question:
- Answer (decision source + date) or \`deferred: <reason>\`:
- Decided / Deferred / Out-of-scope:

## Acceptance criteria

TODO: testable acceptance conditions. Each must be checkable by a command or an observable behavior.

## Non-goals

TODO: explicit non-goals recorded during clarification.
`
}

/** Build the design template body. */
export function designTemplate(changeId: string): string {
  return `# Design — ${changeId}

## Approach

TODO: interfaces, data flow, error paths, and compatibility notes.

## Repository references

TODO: every conclusion cites real files/APIs, e.g. \`packages/.../src/foo.ts\`.

## Risks

TODO: risk list with mitigations.
`
}

/** Build the tasks template body. */
export function tasksTemplate(changeId: string): string {
  return `# Tasks — ${changeId}

TODO: ordered task list. Each task states input, output, affected files,
the verification command, and the rollback point.
`
}
