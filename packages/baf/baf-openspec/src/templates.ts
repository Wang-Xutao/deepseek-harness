/**
 * English skeleton bodies for OpenSpec change documents.
 * Templates are data; handlers fill the marked TODO sections.
 *
 * 【变更】2026-10-06 (问题 4 · OpenSpec × Matt 融合 抓手 2): the design/tasks TODO
 * lines name the workspace rules source — a structural hint only, deliberately
 * NOT a gate condition (work orders quote exactly what the gates check; the
 * rules themselves stay a soft constraint the prompt section points at).
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

Asking discipline (grill-me style): ask ONE blocking question at a time, the
most blocking first. Each question = one line of context + options with a
recommended default; when the customer cannot answer, record your own
recommendation and mark it \`deferred\`. Design starts only when the blocking
list is empty.

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
Any deviation from the workspace rules source (baseline standard.mattPocockRulesRef,
e.g. \`.baf/standards/default-rules.md\`) must be named here with the rule
anchor it deviates from and why.

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
the verification command, and the rollback point. Test-adding tasks follow
the testing-discipline anchor of the workspace rules source (bug fixes land
the regression test first — red, then green).
`
}
