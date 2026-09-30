/**
 * 【变更】2026-09-30 (demo33 问题 4): the standalone 变更看板 HTML builder —
 * a complete, self-contained web page (inline CSS + SVG, zero external
 * assets) baked from a WorkflowDashboardView snapshot. The dashboard modal's
 * 在浏览器中打开 button writes this document to a Blob URL and opens it in a
 * new browser tab, where the full history reads larger than the in-app modal:
 * summary tiles, a mode-distribution donut, a duration ranking, and one card
 * per change (phase, task progress, cost, generated artifacts).
 * Pure string builder — no DOM access, no React, trivially testable.
 * @module @deepseek-ai/dsh-client-ui-baf-workflow/dashboard-html
 */

import type { WorkflowDashboardRow, WorkflowDashboardView } from './tab-types.ts'

/** Localized strings the page renders (built by the caller through `t`). */
export interface DashboardHtmlLabels {
  readonly title: string
  readonly subtitle: string
  readonly generatedAt: string
  readonly snapshotNote: string
  readonly tileActive: string
  readonly tileArchived: string
  readonly tileAbandoned: string
  readonly tileTasks: string
  readonly tileDuration: string
  readonly tileTokens: string
  readonly chartModes: string
  readonly chartDuration: string
  readonly allChanges: string
  readonly empty: string
  readonly tasksHelp: string
  readonly durationHelp: string
  readonly tokensHelp: string
  readonly endedAt: string
  readonly artifactsLabel: string
  readonly artifactStates: Readonly<Record<'template' | 'planned' | 'filled', string>>
  /** Stage label per node id + terminal states (t('node.…')). */
  readonly nodeLabels: Readonly<Record<string, string>>
  /** Mode label per mode id (modeLabel()). */
  readonly modeLabels: Readonly<Record<string, string>>
}

const MODE_COLORS: Readonly<Record<string, string>> = {
  'full-go-path': '#6ea8fe',
  'bug-fix-path': '#ffb86c',
  'clarify-required': '#bd93f9',
}

const MODE_CLASS: Readonly<Record<string, string>> = {
  'full-go-path': 'modeFull',
  'bug-fix-path': 'modeBug',
  'clarify-required': 'modeClarify',
}

/** Escape text for HTML body/attribute contexts. */
function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** ms → compact Chinese duration (same shape the in-app modal shows). */
function fmtDuration(ms: number | undefined): string {
  if (ms === undefined || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${s % 60 > 0 ? `${s % 60}s` : ''}`
  const h = Math.floor(m / 60)
  return `${h}h${m % 60 > 0 ? `${m % 60}m` : ''}`
}

/** tokens → K/M compact form. */
function fmtTokens(n: number | undefined): string {
  if (n === undefined || n <= 0) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** Donut arc segments for the mode distribution. */
function donutSvg(modes: readonly { readonly mode: string; readonly count: number }[]): string {
  const total = modes.reduce((sum, m) => sum + m.count, 0)
  const radius = 52
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const segments = total === 0
    ? `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="#2a3142" stroke-width="16" />`
    : modes.filter(m => m.count > 0).map((m) => {
      const fraction = m.count / total
      const dash = fraction * circumference
      const circle = `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="${MODE_COLORS[m.mode] ?? '#8b93a7'}" stroke-width="16" stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 60 60)" />`
      offset += dash
      return circle
    }).join('')
  return `<svg viewBox="0 0 120 120" class="donut" role="img" aria-label="mode distribution">${segments}<text x="60" y="56" text-anchor="middle" class="donutValue">${total}</text><text x="60" y="74" text-anchor="middle" class="donutLabel">变更</text></svg>`
}

/** One ranked duration bar (top consumers first). */
function durationRankRow(row: WorkflowDashboardRow, max: number): string {
  const width = row.durationMs === undefined || max <= 0 ? 0 : Math.max(4, Math.round((row.durationMs / max) * 100))
  return `<li class="rankRow">
    <span class="rankId">${esc(row.changeId)}</span>
    <span class="rankBar"><i class="${MODE_CLASS[row.mode] ?? ''}" style="width:${width}%"></i></span>
    <span class="rankValue">${fmtDuration(row.durationMs)}</span>
  </li>`
}

/** One per-change card. */
function changeCard(row: WorkflowDashboardRow, labels: DashboardHtmlLabels): string {
  const terminal = row.current === 'completed' || row.current === 'abandoned'
  const stage = labels.nodeLabels[row.current] ?? row.current
  const mode = labels.modeLabels[row.mode] ?? row.mode
  const done = row.tasks?.done ?? 0
  const total = row.tasks?.total ?? 0
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const chips = (row.artifacts ?? []).map(a =>
    `<span class="chip ${a.state}">${esc(a.file)}<i>${esc(labels.artifactStates[a.state] ?? a.state)}</i></span>`).join('')
  return `<li class="change${terminal ? ' terminal' : ' active'}">
    <div class="changeHead">
      <code class="changeId">${esc(row.changeId)}</code>
      <span class="badge ${MODE_CLASS[row.mode] ?? ''}">${esc(mode)}</span>
      <span class="stagePill${terminal ? ' terminal' : ''}">${esc(stage)}</span>
      ${row.endedAt !== undefined ? `<span class="ended">${esc(labels.endedAt)} ${esc(row.endedAt.slice(0, 16).replace('T', ' '))}</span>` : ''}
    </div>
    <div class="changeBody">
      ${row.tasks !== undefined ? `<span class="tasks" title="${esc(labels.tasksHelp)}">
        <span class="bar"><i style="width:${percent}%"></i></span>
        <span class="tasksText">${done}/${total}</span>
      </span>` : ''}
      <span class="metric" title="${esc(labels.durationHelp)}">⏱ ${fmtDuration(row.durationMs)}</span>
      <span class="metric" title="${esc(labels.tokensHelp)}">⇅ ${fmtTokens(row.inputTokens)} / ${fmtTokens(row.outputTokens)}</span>
    </div>
    ${chips.length > 0 ? `<div class="chips"><span class="chipsLabel">${esc(labels.artifactsLabel)}</span>${chips}</div>` : ''}
  </li>`
}

/**
 * Build the complete standalone dashboard page.
 * @param data - the dashboard snapshot (rows + summary).
 * @param labels - localized strings.
 * @returns full HTML document text.
 */
export function buildDashboardHtml(data: WorkflowDashboardView, labels: DashboardHtmlLabels): string {
  const { rows, summary } = data
  const active = rows.filter(r => r.current !== 'completed' && r.current !== 'abandoned')
  const terminal = rows.filter(r => r.current === 'completed' || r.current === 'abandoned')
  const modes = ['full-go-path', 'bug-fix-path', 'clarify-required']
    .map(mode => ({ mode, count: rows.filter(r => r.mode === mode).length }))
    .filter(m => m.count > 0)
  const totalDuration = rows.reduce((sum, r) => sum + (r.durationMs ?? 0), 0)
  const totalTokens = rows.reduce((sum, r) => sum + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0)
  const ranked = [...rows].filter(r => r.durationMs !== undefined).sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0)).slice(0, 8)
  const maxDuration = ranked[0]?.durationMs ?? 0
  const legend = modes.map(m =>
    `<li><i style="background:${MODE_COLORS[m.mode] ?? '#8b93a7'}"></i>${esc(labels.modeLabels[m.mode] ?? m.mode)}<b>${m.count}</b></li>`).join('')
  const cards = [...active, ...terminal].map(row => changeCard(row, labels)).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(labels.title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font: 14px/1.6 "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    background: #0c0f16; color: #d7dce6; min-height: 100vh; padding: 40px clamp(16px, 4vw, 56px) 64px;
  }
  .bgGlow {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(600px 300px at 15% 0%, rgba(110, 168, 254, .14), transparent 70%),
      radial-gradient(500px 260px at 85% 10%, rgba(255, 184, 108, .10), transparent 70%),
      radial-gradient(700px 400px at 50% 110%, rgba(189, 147, 249, .08), transparent 70%);
  }
  main { position: relative; z-index: 1; max-width: 1080px; margin: 0 auto; }
  h1 {
    font-size: 28px; font-weight: 700; letter-spacing: .5px;
    background: linear-gradient(90deg, #8ab4ff, #ffb86c 55%, #bd93f9);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .sub { color: #8b93a7; margin-top: 6px; }
  .meta { color: #66708a; font-size: 12px; margin-top: 10px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin: 28px 0; }
  .tile {
    background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.015));
    border: 1px solid #232b3d; border-radius: 14px; padding: 16px 18px;
    transition: transform .15s ease, border-color .15s ease;
  }
  .tile:hover { transform: translateY(-2px); border-color: #35415c; }
  .tileValue { display: block; font-size: 26px; font-weight: 700; color: #eef2fa; }
  .tileLabel { display: block; margin-top: 4px; color: #8b93a7; font-size: 12px; }
  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; margin-bottom: 28px; }
  .card {
    background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.012));
    border: 1px solid #232b3d; border-radius: 14px; padding: 18px 20px;
  }
  .card h2 { font-size: 15px; font-weight: 600; color: #c6cede; margin-bottom: 14px; }
  .chartBody { display: flex; align-items: center; gap: 22px; }
  .donut { width: 130px; height: 130px; flex: none; }
  .donutValue { fill: #eef2fa; font-size: 26px; font-weight: 700; }
  .donutLabel { fill: #8b93a7; font-size: 11px; }
  .legend { list-style: none; }
  .legend li { display: flex; align-items: center; gap: 8px; padding: 3px 0; color: #aeb6c8; }
  .legend i { width: 10px; height: 10px; border-radius: 3px; flex: none; }
  .legend b { margin-left: auto; color: #eef2fa; }
  .rank { list-style: none; }
  .rankRow { display: grid; grid-template-columns: minmax(120px, 220px) 1fr 64px; align-items: center; gap: 10px; padding: 4px 0; }
  .rankId { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: #aeb6c8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rankBar { display: block; height: 8px; border-radius: 4px; background: #1a2130; overflow: hidden; }
  .rankBar i { display: block; height: 100%; border-radius: 4px; }
  .rankBar .modeFull { background: linear-gradient(90deg, #4d7fe0, #6ea8fe); }
  .rankBar .modeBug { background: linear-gradient(90deg, #d99a4e, #ffb86c); }
  .rankBar .modeClarify { background: linear-gradient(90deg, #9a6fe0, #bd93f9); }
  .rankValue { text-align: right; color: #aeb6c8; font-size: 12px; }
  h2.listTitle { font-size: 17px; font-weight: 700; color: #eef2fa; margin: 30px 0 14px; }
  .changes { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .change { border: 1px solid #232b3d; border-radius: 12px; padding: 14px 16px; background: rgba(255,255,255,.02); }
  .change.active { border-left: 3px solid #6ea8fe; }
  .change.terminal { border-left: 3px solid #2a3142; opacity: .88; }
  .changeHead { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .changeId { font-family: ui-monospace, Consolas, monospace; font-size: 13px; color: #eef2fa; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid transparent; }
  .badge.modeFull { color: #9cc0ff; background: rgba(110, 168, 254, .12); border-color: rgba(110, 168, 254, .35); }
  .badge.modeBug { color: #ffd0a0; background: rgba(255, 184, 108, .12); border-color: rgba(255, 184, 108, .35); }
  .badge.modeClarify { color: #d6b8ff; background: rgba(189, 147, 249, .12); border-color: rgba(189, 147, 249, .35); }
  .stagePill { font-size: 11px; padding: 2px 8px; border-radius: 999px; color: #9fe8b5; background: rgba(84, 200, 124, .12); border-color: rgba(84, 200, 124, .3); border: 1px solid; }
  .stagePill.terminal { color: #8b93a7; background: rgba(139, 147, 167, .1); border-color: rgba(139, 147, 167, .3); }
  .ended { color: #66708a; font-size: 12px; margin-left: auto; }
  .changeBody { display: flex; align-items: center; gap: 18px; margin-top: 10px; flex-wrap: wrap; }
  .tasks { display: inline-flex; align-items: center; gap: 8px; min-width: 180px; }
  .bar { position: relative; display: block; width: 140px; height: 8px; border-radius: 4px; background: #1a2130; overflow: hidden; }
  .bar i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: linear-gradient(90deg, #4d7fe0, #6ea8fe); }
  .tasksText { color: #aeb6c8; font-size: 12px; }
  .metric { color: #aeb6c8; font-size: 12px; }
  .chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
  .chipsLabel { color: #66708a; font-size: 12px; margin-right: 2px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; padding: 3px 9px; border-radius: 999px; border: 1px solid #2a3142; color: #aeb6c8; font-family: ui-monospace, Consolas, monospace; }
  .chip i { font-style: normal; color: #66708a; }
  .chip.filled { color: #9fe8b5; border-color: rgba(84, 200, 124, .35); }
  .chip.planned { color: #ffd0a0; border-color: rgba(255, 184, 108, .35); }
  .empty { color: #8b93a7; padding: 22px 0; text-align: center; }
  footer { margin-top: 34px; color: #5b6478; font-size: 12px; text-align: center; }
</style>
</head>
<body>
<div class="bgGlow"></div>
<main>
  <h1>${esc(labels.title)}</h1>
  <p class="sub">${esc(labels.subtitle)}</p>
  <p class="meta">${esc(labels.generatedAt)}：${new Date().toLocaleString('zh-CN', { hour12: false })}</p>

  <section class="tiles">
    <div class="tile"><span class="tileValue">${summary.active}</span><span class="tileLabel">${esc(labels.tileActive)}</span></div>
    <div class="tile"><span class="tileValue">${summary.archived}</span><span class="tileLabel">${esc(labels.tileArchived)}</span></div>
    <div class="tile"><span class="tileValue">${summary.abandoned}</span><span class="tileLabel">${esc(labels.tileAbandoned)}</span></div>
    <div class="tile"><span class="tileValue">${summary.tasksDone}/${summary.tasksTotal}</span><span class="tileLabel">${esc(labels.tileTasks)}</span></div>
    <div class="tile"><span class="tileValue">${fmtDuration(totalDuration)}</span><span class="tileLabel">${esc(labels.tileDuration)}</span></div>
    <div class="tile"><span class="tileValue">${fmtTokens(totalTokens)}</span><span class="tileLabel">${esc(labels.tileTokens)}</span></div>
  </section>

  <section class="charts">
    <div class="card">
      <h2>${esc(labels.chartModes)}</h2>
      <div class="chartBody">
        ${donutSvg(modes)}
        <ul class="legend">${legend}</ul>
      </div>
    </div>
    <div class="card">
      <h2>${esc(labels.chartDuration)}</h2>
      <ul class="rank">${ranked.map(row => durationRankRow(row, maxDuration)).join('')}</ul>
    </div>
  </section>

  <h2 class="listTitle">${esc(labels.allChanges)}（${rows.length}）</h2>
  <ul class="changes">${cards.length > 0 ? cards : `<li class="empty">${esc(labels.empty)}</li>`}</ul>

  <footer>${esc(labels.snapshotNote)}</footer>
</main>
</body>
</html>`
}
