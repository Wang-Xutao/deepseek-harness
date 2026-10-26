/**
 * 【变更】2026-09-30 (demo33 问题 4): the standalone 变更看板 HTML builder —
 * a complete, self-contained web page (inline CSS + SVG, zero external
 * assets) baked from a WorkflowDashboardView snapshot. The dashboard modal's
 * 在浏览器中打开 button writes this document to a Blob URL and opens it in a
 * new browser tab, where the full history reads larger than the in-app modal:
 * summary tiles, a mode-distribution donut, a duration ranking, and one card
 * per change (phase, task progress, cost, generated artifacts).
 * Pure string builder — no DOM access, no React, trivially testable.
 * 【变更】2026-10-24 (批次十九 2.3): the board's 生成时间 line rides the SHARED
 * timestamp formatter (dashboard-format.ts) so the standalone page and the
 * in-app 测试流图 surface print report times in one format.
 *
 * 【变更】2026-10-26 (批次二十九 6): the board became a READER, not a
 * printout. It gained the ledger's own view controls (筛选: the change-state
 * categories + the workflow mode + the search box; 排序: the sort dimension
 * plus the 升序/降序 direction) and a per-change DETAIL overlay.
 *
 * The page is a static document, so the client hands the builder the rows
 * AND one flattened detail payload per change; the page's inline script
 * filters, re-sorts and renders the detail overlay from that embedded JSON.
 * Nothing is fetched back — the page outlives the app tab that opened it.
 * @module @deepseek-ai/dsh-client-ui-baf-workflow/dashboard-html
 */

import type { WorkflowDashboardRow, WorkflowDashboardView } from './tab-types.ts'
import { formatTimestamp } from './dashboard-format.ts'

/**
 * 【变更】2026-10-26 (批次二十九 6): one change's DETAIL, flattened for the
 * board's overlay.
 *
 * The board is a static page: it cannot ask the host for a change's detail
 * when the customer clicks it. The client therefore reads every detail up
 * front and the builder embeds this shape. Every label is already RESOLVED
 * (the client translated it) — the page only prints.
 */
export interface DashboardHtmlChangeDetail {
  readonly changeId: string
  readonly status: 'ready' | 'unknown-change' | 'no-workspace' | 'failed'
  /** The workflow mode, translated. */
  readonly modeLabel?: string
  /** The change's state (进行中 / 已完成 / 已放弃), translated. */
  readonly stateLabel?: string
  /** The stage the change rests on, translated. */
  readonly stageLabel?: string
  /** The change's start time, formatted by the shared formatter. */
  readonly startedAtText?: string
  /** The change's end time, formatted by the shared formatter. */
  readonly endedAtText?: string
  /** The elapsed time, formatted by the shared formatter. */
  readonly durationText?: string
  /** The token cost, formatted by the shared formatter. */
  readonly tokensText?: string
  /** The plan-ledger rollup, e.g. `3/7`. */
  readonly tasksText?: string
  /** The intake — what the change IS, before any stage ran. */
  readonly intake?: {
    readonly kind: string
    readonly modeLabel: string
    readonly affectedScope: string
    readonly confidence: number
    readonly reasonCodes: readonly string[]
    readonly openspecRequired: boolean
    readonly requiresUserConfirmation: boolean
    readonly confirmation: string
  }
  /** The stage artifacts, one row per file. */
  readonly artifacts?: readonly {
    readonly file: string
    readonly path: string
    readonly stateLabel: string
  }[]
  /** The stage flow — every node of the change's graph, in graph order. */
  readonly stages?: readonly {
    readonly label: string
    readonly statusLabel: string
    readonly onPath: boolean
  }[]
  /** The change's event history, oldest first. */
  readonly history?: readonly {
    readonly at: string
    readonly title: string
    readonly nodeLabel?: string
    readonly gate?: string
    readonly detail?: string
    readonly reason?: string
  }[]
}

/** 【变更】2026-10-26 (批次二十九 6): the board's view-control labels. */
export interface DashboardHtmlBoardLabels {
  /** The 筛选 group's label. */
  readonly filter: string
  /** The sort dimension's label. */
  readonly sort: string
  /** The sort direction's label. */
  readonly order: string
  /** The workflow-mode filter's label. */
  readonly mode: string
  /** The search box's placeholder. */
  readonly search: string
  /** The click hint above the change list. */
  readonly clickHint: string
  /** The change-state categories (id → label). */
  readonly categories: readonly { readonly id: string; readonly label: string }[]
  /** The sort dimensions (id → label). */
  readonly sorts: readonly { readonly id: string; readonly label: string }[]
  /** The sort directions (id → label). */
  readonly orders: readonly { readonly id: string; readonly label: string }[]
  /** The workflow modes (id → label). */
  readonly modes: readonly { readonly id: string; readonly label: string }[]
}

/** 【变更】2026-10-26 (批次二十九 6): the detail overlay's labels. */
export interface DashboardHtmlDetailLabels {
  readonly title: string
  readonly close: string
  readonly intake: string
  readonly kind: string
  readonly scope: string
  readonly confidence: string
  readonly reason: string
  readonly flow: string
  readonly metrics: string
  readonly tasks: string
  readonly artifacts: string
  readonly history: string
  readonly empty: string
  readonly unknown: string
  readonly failed: string
  readonly startedAt: string
  readonly endedAt: string
  readonly mode: string
  readonly duration: string
  readonly tokens: string
  readonly state: string
  /** The OpenSpec flag's label. */
  readonly openSpec: string
  /** The confirmation-needed flag's label. */
  readonly confirmation: string
}

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
  /** 【变更】2026-10-26 (批次二十九 6): the board's view controls. */
  readonly board: DashboardHtmlBoardLabels
  /** 【变更】2026-10-26 (批次二十九 6): the detail overlay's labels. */
  readonly detail: DashboardHtmlDetailLabels
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

/**
 * 【变更】2026-10-26 (批次二十九 6): embed a JSON payload in the page.
 *
 * The payload is written into a `<script type="application/json">` block, so
 * a `</script>` inside the data would close the block early — every `<` is
 * escaped as its JSON unicode form, which the JSON parser reads back as `<`.
 * @param data - the payload.
 * @returns the JSON text, safe to embed in a script block.
 */
function jsonText(data: unknown): string {
  return JSON.stringify(data).replaceAll('<', '\\u003c')
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

/**
 * 【变更】2026-10-26 (批次二十九 6): the change's state — the ledger's own
 * three states (active / completed / abandoned), read off its terminal node.
 * @param row - one dashboard row.
 * @returns the state id.
 */
function stateOf(row: WorkflowDashboardRow): 'active' | 'completed' | 'abandoned' {
  if (row.current === 'abandoned') return 'abandoned'
  if (row.current === 'completed') return 'completed'
  return 'active'
}

/**
 * 【变更】2026-10-26 (批次二十九 6): one per-change card.
 *
 * The card carries the sort/filter facts as data attributes — the page's
 * inline script reads them, so filtering and re-sorting never re-render the
 * markup and the card's own markup stays the single source of truth.
 * @param row - the change.
 * @param labels - the page labels.
 * @param index - the card's position in the unfiltered list.
 * @returns the card markup.
 */
function changeCard(row: WorkflowDashboardRow, labels: DashboardHtmlLabels, index: number): string {
  const terminal = row.current === 'completed' || row.current === 'abandoned'
  const stage = labels.nodeLabels[row.current] ?? row.current
  const mode = labels.modeLabels[row.mode] ?? row.mode
  const done = row.tasks?.done ?? 0
  const total = row.tasks?.total ?? 0
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const chips = (row.artifacts ?? []).map(a =>
    `<span class="chip ${a.state}">${esc(a.file)}<i>${esc(labels.artifactStates[a.state] ?? a.state)}</i></span>`).join('')
  const tokens = row.inputTokens === undefined && row.outputTokens === undefined
    ? ''
    : String((row.inputTokens ?? 0) + (row.outputTokens ?? 0))
  const started = row.startedAt === undefined ? '' : String(Date.parse(row.startedAt) || '')
  const taskRatio = row.tasks === undefined || total === 0 ? '' : String(done / total)
  return `<li class="change${terminal ? ' terminal' : ' active'}" tabindex="0" role="button"
    data-change-id="${esc(row.changeId)}"
    data-state="${stateOf(row)}"
    data-mode="${esc(row.mode)}"
    data-duration="${row.durationMs === undefined ? '' : String(row.durationMs)}"
    data-tokens="${tokens}"
    data-started="${started}"
    data-tasks="${taskRatio}"
    data-index="${index}">
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
 * 【变更】2026-10-26 (批次二十九 6): the board's inline script — the view
 * controls (filter / sort / order) and the change detail overlay.
 *
 * The script is deliberately dependency-free: the page is a file on disk, so
 * there is no framework and no host connection. It reads the embedded JSON
 * and the cards' data attributes, and rewrites the list in place.
 */
const BOARD_SCRIPT = `
(function () {
  var dataEl = document.getElementById('boardData');
  var list = document.getElementById('boardList');
  if (!dataEl || !list) return;
  var DATA = {};
  try { DATA = JSON.parse(dataEl.textContent || '{}'); } catch (err) { DATA = {}; }
  var DETAILS = DATA.details || [];
  var L = DATA.labels || {};
  var cards = Array.prototype.slice.call(list.querySelectorAll('.change'));
  var emptyEl = document.getElementById('boardEmpty');
  var countEl = document.getElementById('boardCount');
  var searchEl = document.getElementById('boardSearch');
  var sortEl = document.getElementById('boardSort');
  var orderEl = document.getElementById('boardOrder');
  var modeEl = document.getElementById('boardMode');
  var segs = Array.prototype.slice.call(document.querySelectorAll('#boardCategories .seg'));

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(el, name) {
    var raw = el.getAttribute(name);
    if (raw === null || raw === '') return undefined;
    var parsed = Number(raw);
    return isNaN(parsed) ? undefined : parsed;
  }
  function sortValue(el, field) {
    if (field === 'duration') return num(el, 'data-duration');
    if (field === 'tokens') return num(el, 'data-tokens');
    if (field === 'startedAt') return num(el, 'data-started');
    if (field === 'tasks') return num(el, 'data-tasks');
    return undefined;
  }
  function apply() {
    var cat = 'all';
    for (var s = 0; s < segs.length; s++) {
      if (segs[s].getAttribute('aria-pressed') === 'true') cat = segs[s].getAttribute('data-cat') || 'all';
    }
    var mode = modeEl ? (modeEl.value || 'all') : 'all';
    var query = searchEl ? String(searchEl.value || '').trim().toLowerCase() : '';
    var field = sortEl ? sortEl.value : 'default';
    var desc = orderEl ? orderEl.value !== 'asc' : true;
    if (orderEl) orderEl.disabled = field === 'default';
    var visible = [];
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i];
      var ok = true;
      if (cat !== 'all' && el.getAttribute('data-state') !== cat) ok = false;
      if (ok && mode !== 'all' && el.getAttribute('data-mode') !== mode) ok = false;
      if (ok && query !== '' && String(el.getAttribute('data-change-id') || '').toLowerCase().indexOf(query) === -1) ok = false;
      el.hidden = !ok;
      if (ok) visible.push(el);
    }
    if (field !== 'default') {
      var dir = desc ? -1 : 1;
      visible.sort(function (a, b) {
        var av = sortValue(a, field);
        var bv = sortValue(b, field);
        if (av === undefined && bv === undefined) return 0;
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        if (av === bv) return String(a.getAttribute('data-change-id') || '').localeCompare(String(b.getAttribute('data-change-id') || ''));
        return (av - bv) * dir;
      });
    }
    for (var v = 0; v < visible.length; v++) list.appendChild(visible[v]);
    if (countEl) countEl.textContent = visible.length + ' / ' + cards.length;
    if (emptyEl) emptyEl.hidden = visible.length !== 0;
  }
  for (var c = 0; c < segs.length; c++) {
    segs[c].addEventListener('click', function (event) {
      for (var o = 0; o < segs.length; o++) {
        segs[o].setAttribute('aria-pressed', segs[o] === event.currentTarget ? 'true' : 'false');
      }
      apply();
    });
  }
  if (searchEl) searchEl.addEventListener('input', apply);
  if (sortEl) sortEl.addEventListener('change', apply);
  if (orderEl) orderEl.addEventListener('change', apply);
  if (modeEl) modeEl.addEventListener('change', apply);

  function detailOf(id) {
    for (var i = 0; i < DETAILS.length; i++) {
      if (DETAILS[i].changeId === id) return DETAILS[i];
    }
    return undefined;
  }
  function figure(label, value) {
    if (value === undefined || value === '') return '';
    return '<span class="dFigure"><span class="dFigureLabel">' + esc(label) + '</span><span class="dFigureValue">' + esc(value) + '</span></span>';
  }
  function renderIntake(intake) {
    var rows = '';
    rows += '<div class="dRow"><span class="dKey">' + esc(L.kind) + '</span><span class="dValue">' + esc(intake.kind) + '</span></div>';
    rows += '<div class="dRow"><span class="dKey">' + esc(L.mode) + '</span><span class="dValue">' + esc(intake.modeLabel) + '</span></div>';
    rows += '<div class="dRow"><span class="dKey">' + esc(L.scope) + '</span><span class="dValue">' + esc(intake.affectedScope) + '</span></div>';
    rows += '<div class="dRow"><span class="dKey">' + esc(L.confidence) + '</span><span class="dValue">' + Math.round(intake.confidence * 100) + '%</span></div>';
    if (intake.reasonCodes && intake.reasonCodes.length > 0) {
      rows += '<div class="dRow"><span class="dKey">' + esc(L.reason) + '</span><span class="dValue">' + esc(intake.reasonCodes.join(' \\u00b7 ')) + '</span></div>';
    }
    var flags = '';
    if (intake.openspecRequired) flags += '<span class="dFlag">' + esc(L.openSpec) + ' \\u2713</span>';
    if (intake.requiresUserConfirmation) flags += '<span class="dFlag warn">' + esc(L.confirmation) + '</span>';
    if (flags !== '') rows += '<div class="dFlags">' + flags + '</div>';
    if (intake.confirmation) rows += '<p class="dSummary">' + esc(intake.confirmation) + '</p>';
    return rows;
  }
  function renderDetail(detail) {
    if (!detail) return '<p class="dEmpty">' + esc(L.failed) + '</p>';
    if (detail.status === 'unknown-change') return '<p class="dEmpty">' + esc(L.unknown) + '</p>';
    if (detail.status === 'no-workspace') return '<p class="dEmpty">' + esc(L.failed) + '</p>';
    if (detail.status === 'failed') return '<p class="dEmpty">' + esc(L.failed) + '</p>';
    var head = '<div class="dFigures">';
    head += figure(L.startedAt, detail.startedAtText);
    head += figure(L.endedAt, detail.endedAtText);
    head += figure(L.duration, detail.durationText);
    head += figure(L.tokens, detail.tokensText);
    head += figure(L.tasks, detail.tasksText);
    head += figure(L.state, detail.stateLabel);
    head += '</div>';
    var left = '<section class="dCard"><h3>' + esc(L.intake) + '</h3>';
    if (detail.intake) left += renderIntake(detail.intake);
    else left += '<p class="dEmpty">' + esc(L.empty) + '</p>';
    left += '</section>';
    if (detail.artifacts && detail.artifacts.length > 0) {
      left += '<section class="dCard"><h3>' + esc(L.artifacts) + '</h3><ul class="dArtifacts">';
      for (var a = 0; a < detail.artifacts.length; a++) {
        var art = detail.artifacts[a];
        left += '<li><code>' + esc(art.file) + '</code><i>' + esc(art.stateLabel) + '</i></li>';
      }
      left += '</ul></section>';
    }
    var mid = '<section class="dCard"><h3>' + esc(L.flow) + '</h3><ul class="dStages">';
    if (detail.stages && detail.stages.length > 0) {
      for (var g = 0; g < detail.stages.length; g++) {
        var stage = detail.stages[g];
        mid += '<li' + (stage.onPath ? ' class="onPath"' : '') + '><span class="dStageName">' + esc(stage.label) + '</span><span class="dStageStatus">' + esc(stage.statusLabel) + '</span></li>';
      }
    } else {
      mid += '<li class="dEmpty">' + esc(L.empty) + '</li>';
    }
    mid += '</ul></section>';
    var right = '<section class="dCard"><h3>' + esc(L.history) + '</h3>';
    if (detail.history && detail.history.length > 0) {
      right += '<ol class="dHistory">';
      for (var h = 0; h < detail.history.length; h++) {
        var entry = detail.history[h];
        right += '<li><span class="dAt">' + esc(entry.at) + '</span><span class="dTitle">' + esc(entry.title) + '</span>';
        if (entry.nodeLabel) right += '<span class="dNode">' + esc(entry.nodeLabel) + '</span>';
        if (entry.gate) right += '<span class="dGate">' + esc(entry.gate) + '</span>';
        if (entry.detail) right += '<span class="dDetail">' + esc(entry.detail) + '</span>';
        if (entry.reason) right += '<span class="dReason">' + esc(entry.reason) + '</span>';
        right += '</li>';
      }
      right += '</ol>';
    } else {
      right += '<p class="dEmpty">' + esc(L.empty) + '</p>';
    }
    right += '</section>';
    return head + '<div class="dColumns"><aside class="dCol">' + left + '</aside><section class="dCol">' + mid + '</section><aside class="dCol">' + right + '</aside></div>';
  }

  var overlay = document.getElementById('boardDetail');
  var overlayBody = document.getElementById('boardDetailBody');
  var overlayId = document.getElementById('boardDetailId');
  var overlayLabel = document.getElementById('boardDetailLabel');
  var closeBtn = document.getElementById('boardDetailClose');
  if (overlayLabel) overlayLabel.textContent = L.title || '';
  if (closeBtn) closeBtn.textContent = L.close || '';

  function openDetail(el) {
    var id = el.getAttribute('data-change-id') || '';
    if (overlayId) overlayId.textContent = id;
    if (overlayBody) overlayBody.innerHTML = renderDetail(detailOf(id));
    if (overlay) overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (closeBtn) closeBtn.focus();
  }
  function closeDetail() {
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = '';
  }
  for (var k = 0; k < cards.length; k++) {
    cards[k].addEventListener('click', function (event) { openDetail(event.currentTarget); });
    cards[k].addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetail(event.currentTarget);
      }
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closeDetail);
  if (overlay) {
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeDetail();
    });
  }
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && overlay && !overlay.hidden) closeDetail();
  });

  apply();
})();
`

/**
 * Build the complete standalone dashboard page.
 * @param data - the dashboard snapshot (rows + summary).
 * @param labels - localized strings.
 * @param details - 【变更】2026-10-26 (批次二十九 6): one flattened detail per
 * change, embedded so the page's detail overlay works offline.
 * @returns full HTML document text.
 */
export function buildDashboardHtml(
  data: WorkflowDashboardView,
  labels: DashboardHtmlLabels,
  details: readonly DashboardHtmlChangeDetail[] = [],
): string {
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
  const ordered = [...active, ...terminal]
  const cards = ordered.map((row, index) => changeCard(row, labels, index)).join('')

  // 【变更】2026-10-26 (批次二十九 6): the board's view controls — the
  // change-state categories, the sort dimension + direction, the workflow
  // mode and the search box. The same four controls the in-app ledger
  // carries, so the board reads like the page it was exported from.
  const categoryButtons = labels.board.categories.map((item, index) =>
    `<button type="button" class="seg" data-cat="${esc(item.id)}" aria-pressed="${index === 0 ? 'true' : 'false'}">${esc(item.label)}</button>`).join('')
  const sortOptions = labels.board.sorts.map(item =>
    `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join('')
  const orderOptions = labels.board.orders.map(item =>
    `<option value="${esc(item.id)}"${item.id === 'desc' ? ' selected' : ''}>${esc(item.label)}</option>`).join('')
  const modeOptions = labels.board.modes.map(item =>
    `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join('')

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
  h2.listTitle { font-size: 17px; font-weight: 700; color: #eef2fa; margin: 30px 0 6px; }
  .listHint { color: #66708a; font-size: 12px; margin-bottom: 12px; }
  .toolbar {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 10px 12px; margin-bottom: 14px;
    border: 1px solid #232b3d; border-radius: 12px; background: rgba(255,255,255,.02);
  }
  .segGroup { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; background: #171d29; border: 1px solid #232b3d; }
  .seg {
    appearance: none; border: 0; background: transparent; color: #8b93a7; cursor: pointer;
    font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 7px; transition: background .14s ease, color .14s ease;
  }
  .seg:hover { color: #c6cede; }
  .seg[aria-pressed="true"] { background: #253048; color: #eef2fa; }
  .ctl { display: inline-flex; align-items: center; gap: 6px; }
  .ctlLabel { color: #66708a; font-size: 11px; }
  .ctlSelect {
    appearance: none; height: 26px; padding: 0 8px; border-radius: 8px;
    border: 1px solid #2a3142; background: #171d29; color: #d7dce6;
    font: inherit; font-size: 12px; cursor: pointer;
  }
  .ctlSelect:hover { border-color: #35415c; }
  .ctlSearch {
    height: 26px; min-width: 160px; padding: 0 10px; border-radius: 8px;
    border: 1px solid #2a3142; background: #171d29; color: #d7dce6;
    font: inherit; font-size: 12px;
  }
  .ctlSearch::placeholder { color: #5b6478; }
  .resultCount { margin-left: auto; color: #66708a; font-size: 12px; }
  .changes { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .change {
    border: 1px solid #232b3d; border-radius: 12px; padding: 14px 16px; background: rgba(255,255,255,.02);
    cursor: pointer; transition: border-color .15s ease, background .15s ease, transform .15s ease;
  }
  .change:hover { border-color: #35415c; background: rgba(255,255,255,.04); transform: translateY(-1px); }
  .change:focus-visible { outline: 2px solid #6ea8fe; outline-offset: 2px; }
  .change.active { border-left: 3px solid #6ea8fe; }
  .change.terminal { border-left: 3px solid #2a3142; opacity: .88; }
  .change[hidden] { display: none; }
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
  .empty[hidden] { display: none; }
  footer { margin-top: 34px; color: #5b6478; font-size: 12px; text-align: center; }

  /* 【变更】2026-10-26 (批次二十九 6): the change detail overlay. */
  .detailBackdrop {
    position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: rgba(4, 6, 11, .72); backdrop-filter: blur(3px);
  }
  .detailBackdrop[hidden] { display: none; }
  .detailPanel {
    width: min(1180px, 100%); max-height: 100%; overflow: auto;
    background: #10141d; border: 1px solid #2a3142; border-radius: 16px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, .55);
  }
  .detailTop {
    display: flex; align-items: center; gap: 12px; padding: 16px 20px;
    border-bottom: 1px solid #232b3d; position: sticky; top: 0; background: #10141d; z-index: 1;
  }
  .detailTitleWrap { display: flex; align-items: baseline; gap: 10px; }
  .detailLabel { color: #8b93a7; font-size: 12px; }
  .detailId { font-family: ui-monospace, Consolas, monospace; font-size: 15px; color: #eef2fa; }
  .detailClose {
    margin-left: auto; appearance: none; border: 1px solid #2a3142; background: #171d29; color: #c6cede;
    font: inherit; font-size: 12px; padding: 5px 14px; border-radius: 8px; cursor: pointer;
  }
  .detailClose:hover { border-color: #35415c; }
  .detailBody { padding: 18px 20px 24px; }
  .dFigures { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; }
  .dFigure {
    display: inline-flex; flex-direction: column; gap: 2px; padding: 8px 14px;
    border: 1px solid #232b3d; border-radius: 10px; background: rgba(255,255,255,.03); min-width: 120px;
  }
  .dFigureLabel { color: #66708a; font-size: 11px; }
  .dFigureValue { color: #eef2fa; font-size: 13px; }
  .dColumns { display: grid; grid-template-columns: 260px minmax(0, 1fr) 320px; gap: 14px; align-items: start; }
  @media (max-width: 980px) { .dColumns { grid-template-columns: 1fr; } }
  .dCol { display: flex; flex-direction: column; gap: 14px; }
  .dCard { border: 1px solid #232b3d; border-radius: 12px; padding: 14px 16px; background: rgba(255,255,255,.02); }
  .dCard h3 { font-size: 13px; font-weight: 600; color: #c6cede; margin-bottom: 10px; }
  .dRow { display: flex; gap: 10px; padding: 3px 0; font-size: 12px; }
  .dKey { color: #66708a; flex: none; min-width: 72px; }
  .dValue { color: #aeb6c8; word-break: break-word; }
  .dFlags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .dFlag { font-size: 11px; padding: 2px 8px; border-radius: 999px; color: #9fe8b5; background: rgba(84,200,124,.12); border: 1px solid rgba(84,200,124,.3); }
  .dFlag.warn { color: #ffd0a0; background: rgba(255,184,108,.12); border-color: rgba(255,184,108,.3); }
  .dSummary { margin-top: 8px; color: #aeb6c8; font-size: 12px; }
  .dArtifacts { list-style: none; }
  .dArtifacts li { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
  .dArtifacts code { font-family: ui-monospace, Consolas, monospace; color: #eef2fa; }
  .dArtifacts i { font-style: normal; color: #66708a; margin-left: auto; }
  .dStages { list-style: none; }
  .dStages li { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(35,43,61,.6); font-size: 12px; }
  .dStages li.onPath .dStageName { color: #eef2fa; font-weight: 600; }
  .dStageName { color: #aeb6c8; }
  .dStageStatus { margin-left: auto; color: #66708a; font-size: 11px; }
  .dHistory { list-style: none; }
  .dHistory li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; padding: 5px 0 5px 12px; position: relative; font-size: 12px; }
  .dHistory li::before { content: ''; position: absolute; left: 0; top: 11px; width: 4px; height: 4px; border-radius: 50%; background: #35415c; }
  .dAt { color: #66708a; font-size: 11px; }
  .dTitle { color: #c6cede; }
  .dNode { color: #9cc0ff; font-size: 11px; }
  .dGate { color: #ffd0a0; font-size: 11px; }
  .dDetail { color: #8b93a7; }
  .dReason { color: #d6b8ff; }
  .dEmpty { color: #8b93a7; font-size: 12px; }
</style>
</head>
<body>
<div class="bgGlow"></div>
<main>
  <h1>${esc(labels.title)}</h1>
  <p class="sub">${esc(labels.subtitle)}</p>
  <p class="meta">${esc(labels.generatedAt)}：${formatTimestamp(new Date().toISOString())}</p>

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

  <h2 class="listTitle">${esc(labels.allChanges)}（<span id="boardCount">${rows.length} / ${rows.length}</span>）</h2>
  <p class="listHint">${esc(labels.board.clickHint)}</p>

  <!-- 【变更】2026-10-26 (批次二十九 6): the board's view controls. -->
  <div class="toolbar">
    <div class="segGroup" id="boardCategories" role="group" aria-label="${esc(labels.board.filter)}">
      ${categoryButtons}
    </div>
    <label class="ctl"><span class="ctlLabel">${esc(labels.board.sort)}</span>
      <select class="ctlSelect" id="boardSort" aria-label="${esc(labels.board.sort)}">${sortOptions}</select>
    </label>
    <label class="ctl"><span class="ctlLabel">${esc(labels.board.order)}</span>
      <select class="ctlSelect" id="boardOrder" aria-label="${esc(labels.board.order)}">${orderOptions}</select>
    </label>
    <label class="ctl"><span class="ctlLabel">${esc(labels.board.mode)}</span>
      <select class="ctlSelect" id="boardMode" aria-label="${esc(labels.board.mode)}">${modeOptions}</select>
    </label>
    <input type="search" class="ctlSearch" id="boardSearch" placeholder="${esc(labels.board.search)}" aria-label="${esc(labels.board.search)}">
  </div>

  <ul class="changes" id="boardList">${cards}<li class="empty" id="boardEmpty"${rows.length > 0 ? ' hidden' : ''}>${esc(labels.empty)}</li></ul>

  <footer>${esc(labels.snapshotNote)}</footer>
</main>

<!-- 【变更】2026-10-26 (批次二十九 6): the change detail overlay. -->
<div class="detailBackdrop" id="boardDetail" hidden>
  <div class="detailPanel" role="dialog" aria-modal="true" aria-label="${esc(labels.detail.title)}">
    <header class="detailTop">
      <div class="detailTitleWrap">
        <span class="detailLabel" id="boardDetailLabel">${esc(labels.detail.title)}</span>
        <span class="detailId" id="boardDetailId"></span>
      </div>
      <button type="button" class="detailClose" id="boardDetailClose">${esc(labels.detail.close)}</button>
    </header>
    <div class="detailBody" id="boardDetailBody"></div>
  </div>
</div>

<script type="application/json" id="boardData">${jsonText({ details, labels: labels.detail })}</script>
<script>${BOARD_SCRIPT}</script>
</body>
</html>`
}
