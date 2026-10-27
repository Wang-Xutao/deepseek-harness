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
 *
 * 【变更】2026-10-27 (批次三十 · 客户反馈): two corrections on the exported
 * page. The top bar's theme control became a real SWITCH (role="switch", a
 * track + knob, sun/moon glyphs) instead of a text button, and the artifact
 * preview left the detail overlay's left column for a MODAL LAYER over the
 * whole page — a pane inside the overlay's scrolling panel could neither
 * grow past the viewport nor read a long document comfortably.
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
    /**
     * 【变更】2026-10-27 (批次三十): the artifact's TEXT, embedded so the board
     * can preview it offline — the page is a file on disk and can never ask the
     * host for a document.
     */
    readonly content?: string
    /** Whether the embedded text was cut at the board's size cap. */
    readonly truncated?: boolean
  }[]
  /** The stage flow — every node of the change's graph, in graph order. */
  readonly stages?: readonly {
    readonly label: string
    readonly statusLabel: string
    readonly onPath: boolean
  }[]
  /**
   * 【变更】2026-10-26 (用户问题 2): the change's COMPLETE workflow graph,
   * laid out by the client with the same grid, the same edges and the same
   * status colours the in-app `FlowCanvas` uses — the board is a static file,
   * so the geometry is resolved before it is written and the page only draws.
   */
  readonly graph?: DashboardHtmlGraph
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

/**
 * 【变更】2026-10-26 (用户问题 2): one laid-out workflow graph for the board.
 *
 * Every coordinate is absolute inside the SVG's own view box, and every label
 * is already translated — the page never measures anything.
 */
export interface DashboardHtmlGraph {
  /** SVG view-box width. */
  readonly width: number
  /** SVG view-box height. */
  readonly height: number
  /** The stage cards, in grid order. */
  readonly nodes: readonly DashboardHtmlGraphNode[]
  /** The connecting edges, in graph order. */
  readonly edges: readonly DashboardHtmlGraphEdge[]
}

/** 【变更】2026-10-26 (用户问题 2): one stage card of the board's graph. */
export interface DashboardHtmlGraphNode {
  readonly id: string
  /** The stage name, translated. */
  readonly label: string
  /** The status pill text, translated (已完成 / 进行中 / 待确认 …). */
  readonly statusLabel: string
  /** The status TONE — the colour family the card's pill and border use. */
  readonly tone: 'completed' | 'active' | 'failed' | 'drifted' | 'gate' | 'idle'
  /** Whether the change's path runs through this stage. */
  readonly onPath: boolean
  /** Whether this is the stage the change currently rests on. */
  readonly current: boolean
  /** Left edge of the card in the SVG view box. */
  readonly x: number
  /** Top edge of the card in the SVG view box. */
  readonly y: number
  /** Card width. */
  readonly width: number
  /** Card height. */
  readonly height: number
  /** Two short figure lines (duration / tokens), translated+formatted. */
  readonly metrics: readonly string[]
}

/** 【变更】2026-10-26 (用户问题 2): one edge of the board's graph. */
export interface DashboardHtmlGraphEdge {
  readonly id: string
  /** The SVG path data (a cubic bezier, exactly the app's shape). */
  readonly path: string
  /** The edge kind — forward / loop / cross / entry. */
  readonly kind: string
  /** Whether the change's current stage touches this edge. */
  readonly active: boolean
  /** The edge's condition text (the edge's `<title>`). */
  readonly title: string
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
  /** 【变更】2026-10-26 (用户问题 2): the graph's 「当前」 pill. */
  readonly current: string
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
  /**
   * 【变更】2026-10-27 (批次三十): the top bar's own labels — the theme switch
   * names the theme it switches TO, and the refresh button says what it does.
   */
  readonly themeLight: string
  readonly themeDark: string
  readonly refresh: string
  /** The artifact preview modal's labels. */
  readonly preview: string
  readonly previewEmpty: string
  readonly previewTruncated: string
  readonly previewClose: string
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
    ? `<circle cx="60" cy="60" r="${radius}" fill="none" class="donutTrack" stroke-width="16" />`
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
  // 【变更】2026-10-27 (批次三十): the PAGE-level labels — the theme switch, the
  // refresh and the artifact preview. They are not part of the detail
  // overlay's own label set, so they travel in their own bag.
  var P = DATA.page || {};
  var cards = Array.prototype.slice.call(list.querySelectorAll('.change'));
  var emptyEl = document.getElementById('boardEmpty');
  var countEl = document.getElementById('boardCount');
  var searchEl = document.getElementById('boardSearch');
  var sortEl = document.getElementById('boardSort');
  var orderEl = document.getElementById('boardOrder');
  var modeEl = document.getElementById('boardMode');
  var segs = Array.prototype.slice.call(document.querySelectorAll('#boardCategories .seg'));

  // 【变更】2026-10-27 (批次三十 · 客户反馈): the THEME SWITCH. The page
  // opens LIGHT (a generated board that lands as a black slab reads as a
  // broken export) and the top bar flips it in one click. The switch's
  // accessible name and its title name the theme a click switches TO; the
  // visible caption names the theme that is ON.
  var themeBtn = document.getElementById('boardThemeToggle');
  var themeState = document.getElementById('boardThemeState');
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function paintThemeSwitch() {
    if (!themeBtn) return;
    var dark = currentTheme() === 'dark';
    var next = dark ? (P.themeLight || '') : (P.themeDark || '');
    var current = dark ? (P.themeDark || '') : (P.themeLight || '');
    themeBtn.setAttribute('aria-checked', dark ? 'true' : 'false');
    themeBtn.setAttribute('title', next);
    themeBtn.setAttribute('aria-label', next);
    if (themeState) themeState.textContent = current;
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      document.documentElement.setAttribute('data-theme', currentTheme() === 'dark' ? 'light' : 'dark');
      paintThemeSwitch();
    });
  }
  paintThemeSwitch();

  // 【变更】2026-10-27 (批次三十): the REFRESH. On desktop the board is a file
  // on disk at a fixed path, so reloading re-reads the file the app wrote last
  // — the customer sees the newest export without re-opening the tab. In a
  // browser the board is a Blob URL and the reload re-reads that Blob.
  var refreshBtn = document.getElementById('boardRefresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      window.location.reload();
    });
  }

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
  // 【变更】2026-10-26 (用户问题 2): the board's COMPLETE workflow graph.
  // The client laid every card and edge out with the in-app canvas' own grid
  // (248 x 128 pitch, 208 x 96 cards, a cubic bezier per edge) and handed the
  // RESOLVED geometry here, so the page only draws — no measuring, no layout
  // engine, and the exported picture matches the app's.
  var TONE = {
    completed: '#4ed17e',
    active: '#d9b64c',
    failed: '#f25a5a',
    drifted: '#f7ad31',
    gate: '#a78bfa',
    idle: '#8b93a7'
  };
  function renderGraph(graph) {
    if (!graph || !graph.nodes || graph.nodes.length === 0) return '';
    var markerId = 'wfArrow';
    var svg = '<svg class="wfGraph" viewBox="0 0 ' + graph.width + ' ' + graph.height + '" width="' + graph.width + '" height="' + graph.height + '" role="img" aria-label="' + esc(L.flow) + '">';
    svg += '<defs><marker id="' + markerId + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="wfArrowHead"/></marker></defs>';
    for (var e = 0; e < graph.edges.length; e++) {
      var edge = graph.edges[e];
      var cls = 'wfEdge wfEdge-' + String(edge.kind || 'forward') + (edge.active ? ' wfEdgeActive' : '');
      svg += '<path class="' + cls + '" d="' + esc(edge.path) + '" marker-end="url(#' + markerId + ')"><title>' + esc(edge.title) + '</title></path>';
    }
    for (var n = 0; n < graph.nodes.length; n++) {
      var node = graph.nodes[n];
      var tone = TONE[node.tone] || TONE.idle;
      var cardCls = 'wfNode wfNode-' + String(node.tone || 'idle')
        + (node.current ? ' wfNodeCurrent' : '')
        + (node.onPath ? '' : ' wfNodeOffPath');
      svg += '<g class="' + cardCls + '" transform="translate(' + node.x + ',' + node.y + ')">';
      svg += '<rect class="wfNodeCard" width="' + node.width + '" height="' + node.height + '" rx="12" ry="12"/>';
      svg += '<text class="wfNodeLabel" x="14" y="26">' + esc(node.label) + '</text>';
      svg += '<text class="wfNodeStatus" x="14" y="46" fill="' + tone + '">' + esc(node.statusLabel) + '</text>';
      for (var m = 0; m < (node.metrics || []).length; m++) {
        svg += '<text class="wfNodeMetric" x="14" y="' + (66 + m * 15) + '">' + esc(node.metrics[m]) + '</text>';
      }
      if (node.current) {
        svg += '<rect class="wfNodePill" x="' + (node.width - 52) + '" y="12" width="40" height="17" rx="8" ry="8"/>';
        svg += '<text class="wfNodePillText" x="' + (node.width - 32) + '" y="24" text-anchor="middle">' + esc(L.current || '\\u5f53\\u524d') + '</text>';
      }
      svg += '</g>';
    }
    svg += '</svg>';
    return '<div class="wfGraphWrap">' + svg + '</div>';
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
        var hasBody = art.content !== undefined && art.content !== null && art.content !== '';
        // 【变更】2026-10-27 (批次三十 · 客户反馈): the artifact row became a
        // BUTTON — the stage document opens in the preview MODAL over the
        // page. A document the export could not read has no body, so its
        // button is disabled rather than opening an empty modal.
        left += '<li><button type="button" class="dArtifactBtn" data-artifact-index="' + a + '"' + (hasBody ? '' : ' disabled') + '>'
          + '<code>' + esc(art.file) + '</code></button><i>' + esc(art.stateLabel) + '</i></li>';
      }
      left += '</ul></section>';
    }
    var mid = '<section class="dCard"><h3>' + esc(L.flow) + '</h3>';
    var graphSvg = renderGraph(detail.graph);
    if (graphSvg !== '') mid += graphSvg;
    else {
      mid += '<ul class="dStages">';
      if (detail.stages && detail.stages.length > 0) {
        for (var g = 0; g < detail.stages.length; g++) {
          var stage = detail.stages[g];
          mid += '<li' + (stage.onPath ? ' class="onPath"' : '') + '><span class="dStageName">' + esc(stage.label) + '</span><span class="dStageStatus">' + esc(stage.statusLabel) + '</span></li>';
        }
      } else {
        mid += '<li class="dEmpty">' + esc(L.empty) + '</li>';
      }
      mid += '</ul>';
    }
    mid += '</section>';
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
  // 【变更】2026-10-27 (批次三十): the change whose detail is on screen — the
  // preview modal reads the artifact out of it.
  var currentDetail = null;
  if (overlayLabel) overlayLabel.textContent = L.title || '';
  if (closeBtn) closeBtn.textContent = L.close || '';

  // 【变更】2026-10-27 (批次三十 · 客户反馈): the artifact PREVIEW — a modal
  // layer over the WHOLE page. The layer is a direct child of the body, so
  // the detail panel's own scrolling can never clip it, and the document's
  // text gets the full window to scroll in.
  var preview = document.getElementById('boardPreview');
  var previewName = document.getElementById('boardPreviewName');
  var previewNote = document.getElementById('boardPreviewNote');
  var previewBody = document.getElementById('boardPreviewBody');
  var previewClose = document.getElementById('boardPreviewClose');
  var previewReturnFocus = null;

  // 【变更】2026-10-27 (批次三十 · 客户反馈): open one stage document in the
  // preview modal over the page.
  function openPreview(index) {
    if (!preview || !currentDetail) return;
    var arts = currentDetail.artifacts || [];
    var art = arts[index];
    if (!art) return;
    if (previewName) previewName.textContent = art.file || '';
    if (previewNote) previewNote.textContent = art.truncated ? (P.previewTruncated || '') : '';
    if (previewBody) previewBody.textContent = (art.content === undefined || art.content === null || art.content === '')
      ? (P.previewEmpty || '')
      : art.content;
    previewReturnFocus = document.activeElement;
    preview.hidden = false;
    if (previewClose) previewClose.focus();
  }
  function closePreview() {
    if (!preview || preview.hidden) return;
    preview.hidden = true;
    var back = previewReturnFocus;
    previewReturnFocus = null;
    if (back && typeof back.focus === 'function') back.focus();
  }
  // The artifact rows are re-rendered with the detail, so their clicks are
  // handled by DELEGATION on the overlay body — one listener for every render.
  if (overlayBody) {
    overlayBody.addEventListener('click', function (event) {
      var node = event.target;
      if (!node || typeof node.closest !== 'function') return;
      var btn = node.closest('.dArtifactBtn');
      if (!btn) return;
      var index = Number(btn.getAttribute('data-artifact-index'));
      if (isNaN(index)) return;
      openPreview(index);
    });
  }
  if (previewClose) previewClose.addEventListener('click', closePreview);
  if (preview) {
    preview.addEventListener('click', function (event) {
      if (event.target === preview) closePreview();
    });
  }

  function openDetail(el) {
    var id = el.getAttribute('data-change-id') || '';
    if (overlayId) overlayId.textContent = id;
    currentDetail = detailOf(id);
    if (overlayBody) overlayBody.innerHTML = renderDetail(currentDetail);
    if (overlay) overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (closeBtn) closeBtn.focus();
  }
  function closeDetail() {
    // 【变更】2026-10-27 (批次三十 · 客户反馈): the preview modal is the
    // topmost layer — it never outlives the detail overlay underneath it.
    if (preview) { preview.hidden = true; previewReturnFocus = null; }
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
    if (event.key !== 'Escape') return;
    // 【变更】2026-10-27 (批次三十 · 客户反馈): the preview modal is the
    // topmost layer — Escape closes it FIRST, and only a second Escape
    // reaches the detail overlay underneath.
    if (preview && !preview.hidden) { closePreview(); return; }
    if (overlay && !overlay.hidden) closeDetail();
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
  :root {
  color-scheme: light;
  --bd-bg: #f3f5fa;
  --bd-panel: #ffffff;
  --bd-panel-2: #f7f9fd;
  --bd-line: #dfe4ee;
  --bd-line-soft: #eaeef5;
  --bd-ink: #1b2130;
  --bd-ink-2: #495468;
  --bd-ink-3: #6d788c;
  --bd-ink-4: #8b95a8;
  --bd-accent: #a97c14;
  --bd-blue: #2f6fd0;
  --bd-orange: #b8690f;
  --bd-violet: #6f4fc4;
  --bd-ok: #1a7f46;
  --bd-warn: #9a5f00;
  --bd-danger: #bf3b2c;
  --bd-selected: #dde6f7;
  --bd-shadow: 0 22px 52px rgba(24, 32, 48, .16);
  --bd-scrim: rgba(28, 34, 48, .46);
  --bd-glow-1: rgba(47, 111, 208, .10);
  --bd-glow-2: rgba(184, 105, 15, .07);
  --bd-glow-3: rgba(111, 79, 196, .06);
  --bd-track: #e5eaf2;
}
/* 【变更】2026-10-27 (批次三十): the dark half. The page opens LIGHT — a
   generated board that lands as a black slab reads as a broken export — and
   the top bar switches the theme in one click. */
html[data-theme="dark"] {
  color-scheme: dark;
  --bd-bg: #0c0f16;
  --bd-panel: #10141d;
  --bd-panel-2: #151a25;
  --bd-line: #232b3d;
  --bd-line-soft: #1a2030;
  --bd-ink: #eef2fa;
  --bd-ink-2: #aeb6c8;
  --bd-ink-3: #8b93a7;
  --bd-ink-4: #6b7488;
  --bd-accent: #d9b64c;
  --bd-blue: #6ea8fe;
  --bd-orange: #ffb86c;
  --bd-violet: #bd93f9;
  --bd-ok: #4ed17e;
  --bd-warn: #f7ad31;
  --bd-danger: #f25a5a;
  --bd-selected: #253048;
  --bd-shadow: 0 24px 60px rgba(0, 0, 0, .55);
  --bd-scrim: rgba(4, 6, 11, .72);
  --bd-glow-1: rgba(110, 168, 254, .14);
  --bd-glow-2: rgba(255, 184, 108, .10);
  --bd-glow-3: rgba(189, 147, 249, .08);
  --bd-track: #1a2130;
}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font: 14px/1.6 "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    background: var(--bd-bg); color: var(--bd-ink); min-height: 100vh; padding: 40px clamp(16px, 4vw, 56px) 64px;
  }
  .bgGlow {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(600px 300px at 15% 0%, var(--bd-glow-1), transparent 70%),
      radial-gradient(500px 260px at 85% 10%, var(--bd-glow-2), transparent 70%),
      radial-gradient(700px 400px at 50% 110%, var(--bd-glow-3), transparent 70%);
  }
  main { position: relative; z-index: 1; max-width: 1080px; margin: 0 auto; }
  h1 {
    font-size: 28px; font-weight: 700; letter-spacing: .5px;
    background: linear-gradient(90deg, var(--bd-blue), var(--bd-orange) 55%, var(--bd-violet));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .sub { color: var(--bd-ink-3); margin-top: 6px; }
  .meta { color: var(--bd-ink-4); font-size: 12px; margin-top: 10px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin: 28px 0; }
  .tile {
    background: var(--bd-panel);
    border: 1px solid var(--bd-line); border-radius: 14px; padding: 16px 18px;
    transition: transform .15s ease, border-color .15s ease;
  }
  .tile:hover { transform: translateY(-2px); border-color: var(--bd-accent); }
  .tileValue { display: block; font-size: 26px; font-weight: 700; color: var(--bd-ink); }
  .tileLabel { display: block; margin-top: 4px; color: var(--bd-ink-3); font-size: 12px; }
  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; margin-bottom: 28px; }
  .card {
    background: var(--bd-panel);
    border: 1px solid var(--bd-line); border-radius: 14px; padding: 18px 20px;
  }
  .card h2 { font-size: 15px; font-weight: 600; color: var(--bd-ink-2); margin-bottom: 14px; }
  .chartBody { display: flex; align-items: center; gap: 22px; }
  .donut { width: 130px; height: 130px; flex: none; }
  /* 【变更】2026-10-27 (批次三十): the empty donut's track follows the theme
     instead of carrying the old dark literal. */
  .donutTrack { stroke: var(--bd-line); }
  .donutValue { fill: var(--bd-ink); font-size: 26px; font-weight: 700; }
  .donutLabel { fill: var(--bd-ink-3); font-size: 11px; }
  .legend { list-style: none; }
  .legend li { display: flex; align-items: center; gap: 8px; padding: 3px 0; color: var(--bd-ink-2); }
  .legend i { width: 10px; height: 10px; border-radius: 3px; flex: none; }
  .legend b { margin-left: auto; color: var(--bd-ink); }
  .rank { list-style: none; }
  .rankRow { display: grid; grid-template-columns: minmax(120px, 220px) 1fr 64px; align-items: center; gap: 10px; padding: 4px 0; }
  .rankId { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--bd-ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rankBar { display: block; height: 8px; border-radius: 4px; background: var(--bd-track); overflow: hidden; }
  .rankBar i { display: block; height: 100%; border-radius: 4px; }
  .rankBar .modeFull { background: linear-gradient(90deg, color-mix(in srgb, var(--bd-blue) 72%, #000), var(--bd-blue)); }
  .rankBar .modeBug { background: linear-gradient(90deg, color-mix(in srgb, var(--bd-orange) 72%, #000), var(--bd-orange)); }
  .rankBar .modeClarify { background: linear-gradient(90deg, color-mix(in srgb, var(--bd-violet) 72%, #000), var(--bd-violet)); }
  .rankValue { text-align: right; color: var(--bd-ink-2); font-size: 12px; }
  h2.listTitle { font-size: 17px; font-weight: 700; color: var(--bd-ink); margin: 30px 0 6px; }
  .listHint { color: var(--bd-ink-4); font-size: 12px; margin-bottom: 12px; }
  .toolbar {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 10px 12px; margin-bottom: 14px;
    border: 1px solid var(--bd-line); border-radius: 12px; background: var(--bd-panel-2);
  }
  .segGroup { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; background: var(--bd-panel-2); border: 1px solid var(--bd-line); }
  .seg {
    appearance: none; border: 0; background: transparent; color: var(--bd-ink-3); cursor: pointer;
    font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 7px; transition: background .14s ease, color .14s ease;
  }
  .seg:hover { color: var(--bd-ink-2); }
  .seg[aria-pressed="true"] { background: var(--bd-selected); color: var(--bd-ink); }
  .ctl { display: inline-flex; align-items: center; gap: 6px; }
  .ctlLabel { color: var(--bd-ink-4); font-size: 11px; }
  .ctlSelect {
    appearance: none; height: 26px; padding: 0 8px; border-radius: 8px;
    border: 1px solid var(--bd-line); background: var(--bd-panel-2); color: var(--bd-ink);
    font: inherit; font-size: 12px; cursor: pointer;
  }
  .ctlSelect:hover { border-color: var(--bd-accent); }
  .ctlSearch {
    height: 26px; min-width: 160px; padding: 0 10px; border-radius: 8px;
    border: 1px solid var(--bd-line); background: var(--bd-panel-2); color: var(--bd-ink);
    font: inherit; font-size: 12px;
  }
  .ctlSearch::placeholder { color: var(--bd-ink-4); }
  .resultCount { margin-left: auto; color: var(--bd-ink-4); font-size: 12px; }
  .changes { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .change {
    border: 1px solid var(--bd-line); border-radius: 12px; padding: 14px 16px; background: var(--bd-panel-2);
    cursor: pointer; transition: border-color .15s ease, background .15s ease, transform .15s ease;
  }
  .change:hover { border-color: var(--bd-accent); background: rgba(255,255,255,.04); transform: translateY(-1px); }
  .change:focus-visible { outline: 2px solid var(--bd-blue); outline-offset: 2px; }
  .change.active { border-left: 3px solid var(--bd-blue); }
  .change.terminal { border-left: 3px solid var(--bd-line); opacity: .88; }
  .change[hidden] { display: none; }
  .changeHead { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .changeId { font-family: ui-monospace, Consolas, monospace; font-size: 13px; color: var(--bd-ink); }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid transparent; }
  .badge.modeFull { color: var(--bd-blue); background: rgba(110, 168, 254, .12); border-color: rgba(110, 168, 254, .35); }
  .badge.modeBug { color: var(--bd-orange); background: rgba(255, 184, 108, .12); border-color: rgba(255, 184, 108, .35); }
  .badge.modeClarify { color: var(--bd-violet); background: rgba(189, 147, 249, .12); border-color: rgba(189, 147, 249, .35); }
  .stagePill { font-size: 11px; padding: 2px 8px; border-radius: 999px; color: var(--bd-ok); background: rgba(84, 200, 124, .12); border-color: rgba(84, 200, 124, .3); border: 1px solid; }
  .stagePill.terminal { color: var(--bd-ink-3); background: rgba(139, 147, 167, .1); border-color: rgba(139, 147, 167, .3); }
  .ended { color: var(--bd-ink-4); font-size: 12px; margin-left: auto; }
  .changeBody { display: flex; align-items: center; gap: 18px; margin-top: 10px; flex-wrap: wrap; }
  .tasks { display: inline-flex; align-items: center; gap: 8px; min-width: 180px; }
  .bar { position: relative; display: block; width: 140px; height: 8px; border-radius: 4px; background: var(--bd-track); overflow: hidden; }
  .bar i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: linear-gradient(90deg, color-mix(in srgb, var(--bd-blue) 72%, #000), var(--bd-blue)); }
  .tasksText { color: var(--bd-ink-2); font-size: 12px; }
  .metric { color: var(--bd-ink-2); font-size: 12px; }
  .chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
  .chipsLabel { color: var(--bd-ink-4); font-size: 12px; margin-right: 2px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--bd-line); color: var(--bd-ink-2); font-family: ui-monospace, Consolas, monospace; }
  .chip i { font-style: normal; color: var(--bd-ink-4); }
  .chip.filled { color: var(--bd-ok); border-color: rgba(84, 200, 124, .35); }
  .chip.planned { color: var(--bd-orange); border-color: rgba(255, 184, 108, .35); }
  .empty { color: var(--bd-ink-3); padding: 22px 0; text-align: center; }
  .empty[hidden] { display: none; }
  footer { margin-top: 34px; color: var(--bd-ink-4); font-size: 12px; text-align: center; }

  /* 【变更】2026-10-26 (批次二十九 6): the change detail overlay. */
  .detailBackdrop {
    position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: var(--bd-scrim); backdrop-filter: blur(3px);
  }
  .detailBackdrop[hidden] { display: none; }
  .detailPanel {
    width: min(1180px, 100%); max-height: 100%; overflow: auto;
    background: var(--bd-panel); border: 1px solid var(--bd-line); border-radius: 16px;
    box-shadow: var(--bd-shadow);
  }
  .detailTop {
    display: flex; align-items: center; gap: 12px; padding: 16px 20px;
    border-bottom: 1px solid var(--bd-line); position: sticky; top: 0; background: var(--bd-panel); z-index: 1;
  }
  .detailTitleWrap { display: flex; align-items: baseline; gap: 10px; }
  .detailLabel { color: var(--bd-ink-3); font-size: 12px; }
  .detailId { font-family: ui-monospace, Consolas, monospace; font-size: 15px; color: var(--bd-ink); }
  .detailClose {
    margin-left: auto; appearance: none; border: 1px solid var(--bd-line); background: var(--bd-panel-2); color: var(--bd-ink-2);
    font: inherit; font-size: 12px; padding: 5px 14px; border-radius: 8px; cursor: pointer;
  }
  .detailClose:hover { border-color: var(--bd-accent); }
  .detailBody { padding: 18px 20px 24px; }
  .dFigures { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; }
  .dFigure {
    display: inline-flex; flex-direction: column; gap: 2px; padding: 8px 14px;
    border: 1px solid var(--bd-line); border-radius: 10px; background: var(--bd-panel-2); min-width: 120px;
  }
  .dFigureLabel { color: var(--bd-ink-4); font-size: 11px; }
  .dFigureValue { color: var(--bd-ink); font-size: 13px; }
  .dColumns { display: grid; grid-template-columns: 260px minmax(0, 1fr) 320px; gap: 14px; align-items: start; }
  @media (max-width: 980px) { .dColumns { grid-template-columns: 1fr; } }
  .dCol { display: flex; flex-direction: column; gap: 14px; }
  .dCard { border: 1px solid var(--bd-line); border-radius: 12px; padding: 14px 16px; background: var(--bd-panel-2); }
  .dCard h3 { font-size: 13px; font-weight: 600; color: var(--bd-ink-2); margin-bottom: 10px; }
  .dRow { display: flex; gap: 10px; padding: 3px 0; font-size: 12px; }
  .dKey { color: var(--bd-ink-4); flex: none; min-width: 72px; }
  .dValue { color: var(--bd-ink-2); word-break: break-word; }
  .dFlags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .dFlag { font-size: 11px; padding: 2px 8px; border-radius: 999px; color: var(--bd-ok); background: rgba(84,200,124,.12); border: 1px solid rgba(84,200,124,.3); }
  .dFlag.warn { color: var(--bd-orange); background: rgba(255,184,108,.12); border-color: rgba(255,184,108,.3); }
  .dSummary { margin-top: 8px; color: var(--bd-ink-2); font-size: 12px; }
  .dArtifacts { list-style: none; }
  .dArtifacts li { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
  .dArtifacts code { font-family: ui-monospace, Consolas, monospace; color: var(--bd-ink); }
  .dArtifacts i { font-style: normal; color: var(--bd-ink-4); margin-left: auto; }
  .dStages { list-style: none; }
  .dStages li { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--bd-line-soft); font-size: 12px; }
  .dStages li.onPath .dStageName { color: var(--bd-ink); font-weight: 600; }
  .dStageName { color: var(--bd-ink-2); }
  .dStageStatus { margin-left: auto; color: var(--bd-ink-4); font-size: 11px; }
  .dHistory { list-style: none; }
  .dHistory li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; padding: 5px 0 5px 12px; position: relative; font-size: 12px; }
  .dHistory li::before { content: ''; position: absolute; left: 0; top: 11px; width: 4px; height: 4px; border-radius: 50%; background: var(--bd-ink-4); }
  .dAt { color: var(--bd-ink-4); font-size: 11px; }
  .dTitle { color: var(--bd-ink-2); }
  .dNode { color: var(--bd-blue); font-size: 11px; }
  .dGate { color: var(--bd-orange); font-size: 11px; }
  .dDetail { color: var(--bd-ink-3); }
  .dReason { color: var(--bd-violet); }
  .dEmpty { color: var(--bd-ink-3); font-size: 12px; }

  /* 【变更】2026-10-26 (用户问题 2): the board's COMPLETE workflow graph — the
     same grid, edges and status colours the in-app FlowCanvas renders. */
  .wfGraphWrap { overflow: auto; max-height: 62vh; border: 1px solid var(--bd-line); border-radius: 12px; background: var(--bd-panel-2); }
  .wfGraph { display: block; }
  .wfEdge {
    fill: none; stroke: var(--bd-ink-4); stroke-width: 1.6; opacity: .85;
    transition: stroke .15s ease, opacity .15s ease;
  }
  .wfEdge-entry, .wfEdge-cross { stroke: var(--bd-blue); stroke-dasharray: 2 5; }
  .wfEdge-loop { stroke: var(--bd-warn); stroke-dasharray: 5 4; }
  .wfEdge-forward { stroke-dasharray: none; }
  .wfEdgeActive { stroke: var(--bd-accent); stroke-width: 2.2; opacity: 1; }
  .wfArrowHead { fill: var(--bd-accent); }
  .wfNodeCard {
    fill: var(--bd-panel); stroke: var(--bd-line); stroke-width: 1;
  }
  .wfNode-completed .wfNodeCard { stroke: rgba(78, 209, 126, .55); }
  .wfNode-active .wfNodeCard { stroke: rgba(217, 182, 76, .6); }
  .wfNode-failed .wfNodeCard { stroke: rgba(242, 90, 90, .55); }
  .wfNode-drifted .wfNodeCard { stroke: rgba(247, 173, 49, .55); }
  .wfNode-gate .wfNodeCard { stroke: rgba(167, 139, 250, .65); }
  .wfNodeCurrent .wfNodeCard { stroke: var(--bd-accent); stroke-width: 2; }
  .wfNodeOffPath { opacity: .72; }
  .wfNodeLabel { fill: var(--bd-ink); font-size: 12.5px; font-weight: 700; }
  .wfNodeStatus { font-size: 10.5px; font-weight: 700; }
  .wfNodeMetric { fill: var(--bd-ink-3); font-size: 10px; }
  .wfNodePill { fill: var(--bd-accent); }
  .wfNodePillText { fill: #1a1406; font-size: 9px; font-weight: 700; }

  /* 【变更】2026-10-27 (批次三十): the top bar — the page's identity on the
     left, the one-click theme switch and the refresh on the right. */
  .topBar {
    position: relative; z-index: 1;
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    padding: 26px 0 4px;
  }
  .topTitle { min-width: 0; }
  .topTitle h1 { margin-top: 0; }
  .topActions { display: flex; align-items: center; gap: 8px; flex: none; }
  .topBtn {
    appearance: none; display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: 9px; cursor: pointer;
    border: 1px solid var(--bd-line); background: var(--bd-panel); color: var(--bd-ink-2);
    font: inherit; font-size: 12px; font-weight: 600;
    transition: border-color .15s ease, color .15s ease, box-shadow .15s ease;
  }
  .topBtn:hover { border-color: var(--bd-accent); color: var(--bd-ink); box-shadow: 0 0 0 3px color-mix(in srgb, var(--bd-accent) 12%, transparent); }
  .topBtn:focus-visible { outline: 2px solid var(--bd-blue); outline-offset: 2px; }

  /* 【变更】2026-10-27 (批次三十 · 客户反馈): the THEME SWITCH — a real
     switch (track + knob + sun/moon glyphs) instead of a text button. Every
     colour comes from the theme variables, so the widget reads in both
     modes; the glyph swap rides the same data-theme attribute the rest of
     the page uses. */
  .themeSwitch {
    appearance: none; display: inline-flex; align-items: center; gap: 8px;
    padding: 5px 12px 5px 6px; border-radius: 999px; cursor: pointer;
    border: 1px solid var(--bd-line); background: var(--bd-panel); color: var(--bd-ink-2);
    font: inherit; font-size: 12px; font-weight: 600;
    transition: border-color .15s ease, color .15s ease;
  }
  .themeSwitch:hover { border-color: var(--bd-accent); color: var(--bd-ink); }
  .themeSwitch:focus-visible { outline: 2px solid var(--bd-blue); outline-offset: 2px; }
  .themeSwitchTrack {
    position: relative; flex: none; width: 40px; height: 22px; border-radius: 999px;
    background: var(--bd-track); border: 1px solid var(--bd-line);
    transition: background .15s ease, border-color .15s ease;
  }
  .themeSwitch[aria-checked="true"] .themeSwitchTrack {
    background: color-mix(in srgb, var(--bd-accent) 26%, var(--bd-track));
    border-color: color-mix(in srgb, var(--bd-accent) 55%, var(--bd-line));
  }
  .themeKnob {
    position: absolute; top: 1px; left: 1px; width: 18px; height: 18px; border-radius: 50%;
    background: var(--bd-accent); border: 1px solid var(--bd-line);
    transition: transform .15s ease;
  }
  .themeSwitch[aria-checked="true"] .themeKnob { transform: translateX(18px); }
  .themeGlyph {
    position: absolute; left: 50%; top: 50%; width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px;
    color: var(--bd-panel);
  }
  .themeGlyphCore, .themeGlyphMoonBody { fill: currentColor; }
  .themeGlyphRay { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }
  .themeGlyphMoon { display: none; }
  html[data-theme="dark"] .themeGlyphSun { display: none; }
  html[data-theme="dark"] .themeGlyphMoon { display: block; }
  .themeSwitchState { min-width: 30px; text-align: left; color: var(--bd-ink-2); }

  /* 【变更】2026-10-27 (批次三十 · 客户反馈): the artifact PREVIEW — a modal
     LAYER over the whole page instead of a pane in the detail overlay's
     left column. The layer is a direct child of the body, so the detail
     panel's own scrolling never clips it, and the dialog is capped to the
     viewport with only its body scrolling. */
  .dArtifactBtn {
    appearance: none; border: 0; background: transparent; padding: 0; cursor: pointer;
    font: inherit; text-align: left; border-radius: 4px;
  }
  .dArtifactBtn:hover code { color: var(--bd-blue); text-decoration: underline; }
  .dArtifactBtn:disabled { cursor: default; opacity: .55; }
  .dArtifactBtn:disabled:hover code { color: var(--bd-ink); text-decoration: none; }
  .previewBackdrop {
    position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: var(--bd-scrim); backdrop-filter: blur(3px);
  }
  .previewBackdrop[hidden] { display: none; }
  .previewDialog {
    display: flex; flex-direction: column; width: min(1080px, 100%); max-height: 100%; min-height: 0;
    background: var(--bd-panel); border: 1px solid var(--bd-line); border-radius: 16px;
    box-shadow: var(--bd-shadow); overflow: hidden;
  }
  .previewHead {
    flex: none; display: flex; align-items: center; gap: 10px; padding: 14px 18px;
    border-bottom: 1px solid var(--bd-line); background: var(--bd-panel-2);
  }
  .previewName { font-family: ui-monospace, Consolas, monospace; font-size: 13px; color: var(--bd-ink); word-break: break-all; }
  .previewNote { color: var(--bd-warn); font-size: 11px; }
  .previewClose {
    margin-left: auto; flex: none; appearance: none; border: 1px solid var(--bd-line); background: var(--bd-panel);
    color: var(--bd-ink-3); font: inherit; font-size: 11px; padding: 4px 12px; border-radius: 7px; cursor: pointer;
  }
  .previewClose:hover { border-color: var(--bd-accent); color: var(--bd-ink); }
  .previewClose:focus-visible { outline: 2px solid var(--bd-blue); outline-offset: 2px; }
  .previewBody {
    flex: 1 1 auto; min-height: 0; margin: 0; padding: 16px 18px; overflow: auto;
    font-family: ui-monospace, Consolas, monospace; font-size: 12px; line-height: 1.7;
    white-space: pre-wrap; word-break: break-word; color: var(--bd-ink-2);
  }
</style>
</head>
<body>
<div class="bgGlow"></div>
<main>
  <!-- 【变更】2026-10-27 (批次三十 · 客户反馈): the top bar — the page's
       identity on the left, the one-click theme SWITCH and the refresh on
       the right. The switch is a real role="switch" control: a track, a
       knob and a sun/moon glyph pair that follow the page's data-theme. -->
  <header class="topBar">
    <div class="topTitle">
      <h1>${esc(labels.title)}</h1>
      <p class="sub">${esc(labels.subtitle)}</p>
      <p class="meta">${esc(labels.generatedAt)}：${formatTimestamp(new Date().toISOString())}</p>
    </div>
    <div class="topActions">
      <button type="button" class="themeSwitch" id="boardThemeToggle" role="switch" aria-checked="false"
        title="${esc(labels.themeDark)}" aria-label="${esc(labels.themeDark)}">
        <span class="themeSwitchTrack" aria-hidden="true">
          <span class="themeKnob">
            <svg class="themeGlyph themeGlyphSun" viewBox="0 0 24 24" focusable="false">
              <circle class="themeGlyphCore" cx="12" cy="12" r="4.4" />
              <path class="themeGlyphRay" d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6M4.6 4.6l1.9 1.9M17.5 17.5l1.9 1.9M19.4 4.6l-1.9 1.9M6.5 17.5l-1.9 1.9" />
            </svg>
            <svg class="themeGlyph themeGlyphMoon" viewBox="0 0 24 24" focusable="false">
              <path class="themeGlyphMoonBody" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </span>
        </span>
        <span class="themeSwitchState" id="boardThemeState">${esc(labels.themeLight)}</span>
      </button>
      <button type="button" class="topBtn" id="boardRefresh" title="${esc(labels.refresh)}">${esc(labels.refresh)}</button>
    </div>
  </header>

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

<!-- 【变更】2026-10-27 (批次三十 · 客户反馈): the artifact PREVIEW — a modal
     layer over the whole page, NOT a pane inside the detail overlay's left
     column. It is a direct child of the body, so the detail panel's own
     scrolling and stacking can neither clip nor trap it. The document's
     text is embedded by the export because the page is a static file and
     can never ask the host for it. -->
<div class="previewBackdrop" id="boardPreview" hidden>
  <div class="previewDialog" role="dialog" aria-modal="true" aria-label="${esc(labels.preview)}">
    <div class="previewHead">
      <span class="previewName" id="boardPreviewName"></span>
      <span class="previewNote" id="boardPreviewNote"></span>
      <button type="button" class="previewClose" id="boardPreviewClose">${esc(labels.previewClose)}</button>
    </div>
    <pre class="previewBody" id="boardPreviewBody"></pre>
  </div>
</div>

<script type="application/json" id="boardData">${jsonText({
  details,
  labels: labels.detail,
  // 【变更】2026-10-27 (批次三十 · 客户反馈): the page-level strings the
  // inline script reads at runtime. The preview modal's own head (name,
  // note, close button) is static markup, so its close label no longer
  // travels in this bag.
  page: {
    themeLight: labels.themeLight,
    themeDark: labels.themeDark,
    refresh: labels.refresh,
    preview: labels.preview,
    previewEmpty: labels.previewEmpty,
    previewTruncated: labels.previewTruncated,
  },
})}</script>
<script>${BOARD_SCRIPT}</script>
</body>
</html>`
}
