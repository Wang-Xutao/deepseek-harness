# @deepseek-ai/dsh-client-ui-baf-tracegraph

English | [中文](README.zh.md)

BAF overlay conversation view **轨迹图** (`trace-graph`): session stats with
animated icons, a turn navigator carrying per-turn duration and token totals,
REQUEST→RESPONSE→TOOL pipeline cards with hover/click lift, orchestration
phases that open child session traces inline through `sessions.ensureOpen`
without changing the current selection, and a 工作流 settings section that
gates the tab behind `baf-workflow.showTraceGraph`.

Consumes the existing Trajectory snapshot and Chat `workflow-run` nodes; does
not replace the Trajectory tab.

## Settings

The plugin registers a `settings.section` entry `workflow` (nav order 20) and
the durable namespace `baf-workflow` with one field:

| Field          | Type      | Default | Effect on the conversation view        |
| -------------- | --------- | ------- | -------------------------------------- |
| `showTraceGraph` | `boolean` | `true`  | Mounts the "轨迹图" tab when true.   |

Closing the switch removes the tab from the conversation view ring at the
next render; flipping it back on re-registers the tab on the same scope.

## Model Experience

None.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Workflow script/log/output detail remains outside this surface (not durable in Session).
- In-flight step durations stay blank, matching Trajectory.
- Child inline loading requires the child Session to be list-eligible (or already scoped).