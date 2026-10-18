'use strict';

/**
 * Aggregate Spec-flow blockers for `/baf-workflow:status`.
 * Read-only: comet status JSON, change `.comet.yaml`, ut-coverage.json,
 * clang-format dry-run, docs/api site sync, ci-index / AGENTS BUILD_CMD, verify reports.
 * Does NOT run project BUILD_CMD or doxygen.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { checkClangFormat } = require('./check-clang-format.cjs');
const { checkDocsApiGate } = require('./check-docs-api.cjs');
const { checkCommitSpan } = require('./check-commit-span.cjs');

const UT_COVERAGE_REL = path.join('.baf', 'reports', 'ut-coverage.json');
const STATIC_ANALYSIS_REL = path.join('.baf', 'reports', 'static-analysis.json');
const CI_INDEX_REL = path.join('.baf', 'standards', 'ci-index.md');

const BUILD_FAIL_RE =
  /GAP|构建失败|编译失败|compile\s+failed|build\s+failed|链接失败|link\s+failed/i;

/**
 * @param {string} cmd
 * @returns {string}
 */
function which(cmd) {
  if (process.platform === 'win32') {
    const r = spawnSync('where', [cmd], { encoding: 'utf8', windowsHide: true });
    return r.status === 0 ? (r.stdout || '').split(/\r?\n/)[0].trim() : '';
  }
  const r = spawnSync('sh', ['-c', `command -v ${JSON.stringify(cmd).slice(1, -1)}`], {
    encoding: 'utf8',
  });
  return r.status === 0 ? (r.stdout || '').trim() : '';
}

/**
 * @param {unknown} status
 * @returns {object[]}
 */
function listClassicChanges(status) {
  if (!status || typeof status !== 'object') return [];
  const classic = status.workflows?.classic?.changes;
  if (Array.isArray(classic) && classic.length) return classic;
  if (Array.isArray(status.changes)) {
    return status.changes.filter((c) => c && (c.cometManaged !== false || c.phase));
  }
  return [];
}

/**
 * @param {string} projectRoot
 * @param {{ whichFn?: Function, spawnFn?: Function, cometStatus?: object|null }} [opts]
 * @returns {{ status: object|null, error: string|null, raw: string }}
 */
function loadCometStatusJson(projectRoot, opts = {}) {
  if (opts.cometStatus !== undefined) {
    return { status: opts.cometStatus, error: null, raw: '' };
  }
  const whichFn = opts.whichFn || which;
  const spawnFn = opts.spawnFn || spawnSync;
  const comet = whichFn('comet') || whichFn('comet.cmd');
  if (!comet) {
    return { status: null, error: '编排运行时未安装（comet 不在 PATH）', raw: '' };
  }
  const r = spawnFn(comet, ['status', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: true,
    windowsHide: true,
  });
  const raw = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status !== 0 && !r.stdout) {
    return {
      status: null,
      error: `comet status --json 失败（exit ${r.status ?? '?'}）`,
      raw,
    };
  }
  try {
    const text = (r.stdout || '').trim() || raw;
    const start = text.indexOf('{');
    const jsonText = start >= 0 ? text.slice(start) : text;
    return { status: JSON.parse(jsonText), error: null, raw: text };
  } catch (e) {
    return {
      status: null,
      error: `无法解析 comet status --json：${e.message || e}`,
      raw,
    };
  }
}

/**
 * @param {string} projectRoot
 * @returns {'docs'|'legacy'|null}
 */
function detectArtifactLayout(projectRoot) {
  const cfgPath = path.join(projectRoot, '.comet', 'config.yaml');
  if (fs.existsSync(cfgPath)) {
    try {
      const text = fs.readFileSync(cfgPath, 'utf8');
      const m = text.match(/artifact_layout:\s*(\w+)/);
      if (m && (m[1] === 'docs' || m[1] === 'legacy')) return m[1];
    } catch {
      /* ignore */
    }
  }
  if (fs.existsSync(path.join(projectRoot, 'docs', 'openspec', 'changes'))) return 'docs';
  if (fs.existsSync(path.join(projectRoot, 'openspec', 'changes'))) return 'legacy';
  return null;
}

/**
 * @param {string} projectRoot
 * @param {string} changeName
 * @returns {string|null}
 */
function resolveChangeDir(projectRoot, changeName) {
  const layout = detectArtifactLayout(projectRoot);
  const roots = [];
  if (layout === 'docs' || !layout) {
    roots.push(path.join(projectRoot, 'docs', 'openspec', 'changes', changeName));
  }
  if (layout === 'legacy' || !layout) {
    roots.push(path.join(projectRoot, 'openspec', 'changes', changeName));
  }
  for (const dir of roots) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

/**
 * Minimal YAML scalar reader for `.comet.yaml` (no nested structures).
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function readCometYamlScalars(filePath) {
  const out = {};
  if (!filePath || !fs.existsSync(filePath)) return out;
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (v === 'null' || v === '~' || v === '') v = '';
    out[m[1]] = v;
  }
  return out;
}

/**
 * @param {string} projectRoot
 * @param {string} changeDir
 * @returns {string[]}
 */
function findVerifyReportPaths(projectRoot, changeDir) {
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > 3 || !fs.existsSync(dir)) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git') continue;
        walk(full, depth + 1);
      } else if (/\.md$/i.test(ent.name) && /verify/i.test(ent.name)) {
        hits.push(full);
      }
    }
  };
  walk(changeDir, 0);
  const reportsDir = path.join(projectRoot, 'docs', 'superpowers', 'reports');
  if (fs.existsSync(reportsDir)) {
    try {
      for (const name of fs.readdirSync(reportsDir)) {
        if (/\.md$/i.test(name) && /verify/i.test(name)) {
          hits.push(path.join(reportsDir, name));
        }
      }
    } catch {
      /* ignore */
    }
  }
  return hits;
}

/**
 * @param {string} filePath
 * @returns {string|null} short reason line
 */
function scanVerifyReportForBuildGap(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  if (!BUILD_FAIL_RE.test(text)) return null;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (BUILD_FAIL_RE.test(line)) {
      const trimmed = line.trim().replace(/^#+\s*/, '').slice(0, 160);
      if (trimmed) return trimmed;
    }
  }
  return path.basename(filePath);
}

/**
 * @param {string} projectRoot
 * @returns {{ todo: boolean, source: string|null, status: 'todo'|'configured'|'missing' }}
 */
function checkBuildCmdTodo(projectRoot) {
  const resolved = resolveBuildCmdStatus(projectRoot);
  return {
    todo: resolved.status === 'todo',
    source: resolved.source,
    status: resolved.status,
  };
}

/**
 * @param {string} projectRoot
 * @returns {{ status: 'todo'|'configured'|'missing', source: string|null }}
 */
function resolveBuildCmdStatus(projectRoot) {
  const candidates = [
    { rel: CI_INDEX_REL, label: 'ci-index' },
    { rel: 'AGENTS.md', label: 'AGENTS.md' },
  ];
  let sawBuildRow = false;
  let lastSource = null;
  for (const { rel, label } of candidates) {
    const full = path.join(projectRoot, rel);
    if (!fs.existsSync(full)) continue;
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    if (/TODO:\s*BUILD_CMD|BUILD_CMD[`\s]*\|?\s*`?TODO/i.test(text) || /`TODO: BUILD_CMD`/i.test(text)) {
      return { status: 'todo', source: label };
    }
    if (/构建[^\n]*TODO:\s*BUILD_CMD/i.test(text)) {
      return { status: 'todo', source: label };
    }
    // Table / inline build command that is not TODO
    if (
      /\|\s*构建\s*\|[^\n]*\|/i.test(text) ||
      /\|\s*build\s*\|[^\n]*\|/i.test(text) ||
      /BUILD_CMD/i.test(text)
    ) {
      sawBuildRow = true;
      lastSource = label;
      // If the build cell still looks empty / placeholder
      if (/构建\s*\|\s*`?\s*`?\s*\|/i.test(text) || /build\s*\|\s*`?\s*TODO/i.test(text)) {
        return { status: 'todo', source: label };
      }
    }
  }
  if (sawBuildRow) return { status: 'configured', source: lastSource };
  return { status: 'missing', source: null };
}

/**
 * @param {string} projectRoot
 * @returns {{
 *   exists: boolean,
 *   passed_tests: boolean|null,
 *   generated_at: string|null,
 *   path: string,
 * }}
 */
function readUtCoverage(projectRoot) {
  const full = path.join(projectRoot, UT_COVERAGE_REL);
  if (!fs.existsSync(full)) {
    return { exists: false, passed_tests: null, generated_at: null, path: full };
  }
  try {
    const j = JSON.parse(fs.readFileSync(full, 'utf8'));
    return {
      exists: true,
      passed_tests: typeof j.passed_tests === 'boolean' ? j.passed_tests : null,
      generated_at: typeof j.generated_at === 'string' ? j.generated_at : null,
      path: full,
    };
  } catch {
    return { exists: true, passed_tests: null, generated_at: null, path: full };
  }
}

/**
 * @param {string} projectRoot
 * @returns {{
 *   exists: boolean,
 *   passed: boolean|null,
 *   generated_at: string|null,
 *   path: string,
 * }}
 */
function readStaticAnalysis(projectRoot) {
  const full = path.join(projectRoot, STATIC_ANALYSIS_REL);
  if (!fs.existsSync(full)) {
    return { exists: false, passed: null, generated_at: null, path: full };
  }
  try {
    const j = JSON.parse(fs.readFileSync(full, 'utf8'));
    return {
      exists: true,
      passed: typeof j.passed === 'boolean' ? j.passed : null,
      generated_at: typeof j.generated_at === 'string' ? j.generated_at : null,
      path: full,
    };
  } catch {
    return { exists: true, passed: null, generated_at: null, path: full };
  }
}

/**
 * Whether this change must satisfy enterprise quality gates (UT / format / build evidence).
 * @param {object} change
 * @param {Record<string, string>} yaml
 * @returns {boolean}
 */
function needsQualityGate(change, yaml) {
  const phase = String(change.phase || yaml.phase || '').toLowerCase();
  const verifyResult = change.verifyResult ?? change.verify_result ?? yaml.verify_result ?? null;
  if (phase === 'verify' || phase === 'archive') return true;
  if (verifyResult === 'pending' || verifyResult === 'pass' || verifyResult === 'fail') return true;
  return false;
}

/**
 * @param {object} change
 * @param {Record<string, string>} yaml
 * @returns {boolean}
 */
function isFullWorkflow(change, yaml) {
  const w = String(change.workflow || yaml.workflow || yaml.classic_profile || '').toLowerCase();
  return w === 'full' || yaml.classic_profile === 'full';
}

/**
 * @param {string|null|undefined} generatedAt
 * @param {string|null|undefined} createdAt
 * @returns {boolean} true if report is older than change creation day
 */
function isUtStale(generatedAt, createdAt) {
  if (!generatedAt || !createdAt) return false;
  const g = Date.parse(generatedAt);
  let c = Date.parse(createdAt);
  if (Number.isNaN(c) && /^\d{4}-\d{2}-\d{2}$/.test(createdAt)) {
    c = Date.parse(`${createdAt}T00:00:00.000Z`);
  }
  if (Number.isNaN(g) || Number.isNaN(c)) return false;
  return g < c;
}

/**
 * @param {object} change
 * @param {string} projectRoot
 * @param {{ blockers: string[], warnings: string[] }} out
 * @param {{
 *   needsGate: boolean,
 *   whichFn?: Function,
 *   spawnFn?: Function,
 *   skipClangFormat?: boolean,
 *   skipDocsApi?: boolean,
 *   checkCommitSpanFn?: Function,
 *   commitSpanRunFn?: Function,
 *   commitSpanMax?: number,
 * }} flags
 */
function analyzeChange(change, projectRoot, out, flags) {
  const name = change.name || '?';
  const changeDir = resolveChangeDir(projectRoot, name);
  const yamlPath = changeDir ? path.join(changeDir, '.comet.yaml') : null;
  const yaml = yamlPath ? readCometYamlScalars(yamlPath) : {};

  const phase = change.phase || yaml.phase || '';
  const verifyResult = change.verifyResult ?? change.verify_result ?? yaml.verify_result ?? null;
  const tddMode = String(change.tddMode || change.tdd_mode || yaml.tdd_mode || '').toLowerCase();
  const baseRef = change.baseRef || change.base_ref || yaml.base_ref || null;
  const createdAt = change.createdAt || change.created_at || yaml.created_at || null;

  if (change.error) {
    out.blockers.push(`【阻塞】变更 ${name} · 状态异常：${change.error}`);
  }

  // Enterprise: full Spec must use TDD mode (hotfix/tweak may use direct).
  if (isFullWorkflow(change, yaml) && tddMode === 'direct') {
    out.blockers.push(
      `【阻塞】TDD · 变更 ${name} · full 规格须 tdd_mode=tdd（当前 direct）· 不得宣称构建/验证完成 · 下一步：改回 tdd 并按先失败用例→实现循环补测，或用户明确书面授权跳过 TDD 后再推进`
    );
  }

  if (phase === 'verify' && (verifyResult === 'pending' || verifyResult == null || verifyResult === '')) {
    flags.needsGate = true;
    out.blockers.push(
      `【阻塞】变更 ${name} · 验证未完成（verify_result=${verifyResult || 'pending'}）· 不得宣称 verify-pass / 不得 archive`
    );
  }

  if (verifyResult === 'fail') {
    out.blockers.push(`【阻塞】变更 ${name} · 验证结果为 fail · 须回构建修复后再验`);
  }

  const gate = needsQualityGate(change, yaml);
  if (gate) flags.needsGate = true;

  const checks = change.commandChecks || null;
  const build = checks?.build;
  if (build && typeof build.exitCode === 'number' && build.exitCode !== 0) {
    out.blockers.push(
      `【阻塞】变更 ${name} · 编译/构建失败 · exit=${build.exitCode}` +
        (build.command ? ` · ${build.command}` : '') +
        (build.timestamp ? ` · recorded ${build.timestamp}` : '')
    );
  }

  const buildCmd = resolveBuildCmdStatus(projectRoot);
  if (gate && buildCmd.status === 'configured') {
    const okBuild = build && typeof build.exitCode === 'number' && build.exitCode === 0;
    if (!okBuild) {
      out.blockers.push(
        `【阻塞】缺构建证据 · 变更 ${name} · BUILD_CMD 已配置但无 exit=0 的构建检查记录 · 不得宣称验证完成 · 下一步：在本机跑 BUILD_CMD，把 exit code 写入验证证据后重跑 /baf-workflow:status`
      );
    }
  }

  const verify = checks?.verify;
  if (verify && typeof verify.exitCode === 'number' && verify.exitCode !== 0) {
    out.blockers.push(
      `【阻塞】变更 ${name} · 验证命令失败 · exit=${verify.exitCode}` +
        (verify.command ? ` · ${verify.command}` : '')
    );
  }

  const runtimeEval = change.runtimeEval;
  if (runtimeEval && runtimeEval.passed === false) {
    const missing = Array.isArray(runtimeEval.missingEvidence)
      ? runtimeEval.missingEvidence.join(', ')
      : '';
    out.blockers.push(
      `【阻塞】变更 ${name} · 缺运行证据` +
        (runtimeEval.stepId ? `（${runtimeEval.stepId}）` : '') +
        (missing ? ` · missing: ${missing}` : '')
    );
  }

  if (changeDir) {
    for (const report of findVerifyReportPaths(projectRoot, changeDir)) {
      const reason = scanVerifyReportForBuildGap(report);
      if (reason) {
        out.blockers.push(
          `【阻塞】变更 ${name} · 验证报告标明构建/证据缺口 · ${reason}`
        );
        break;
      }
    }
  }

  if (gate && !flags.skipClangFormat) {
    const fmt = checkClangFormat(projectRoot, {
      baseRef,
      whichFn: flags.whichFn,
      spawnFn: flags.spawnFn,
    });
    if (fmt.blocker) {
      out.blockers.push(fmt.blocker.replace('【阻塞】代码格式 ·', `【阻塞】代码格式 · 变更 ${name} ·`));
    } else if (fmt.warning) {
      out.warnings.push(fmt.warning);
    }
  }

  if (gate && !flags.skipDocsApi) {
    const docs = checkDocsApiGate(projectRoot, {
      baseRef,
      whichFn: flags.whichFn,
      spawnFn: flags.spawnFn,
      changeName: name,
    });
    for (const b of docs.blockers) out.blockers.push(b);
    for (const w of docs.warnings) out.warnings.push(w);
  }

  if (gate) {
    const ut = readUtCoverage(projectRoot);
    if (!ut.exists) {
      out.blockers.push(
        `【阻塞】单元测试/质量门 · 变更 ${name} · 缺少 ${UT_COVERAGE_REL.replace(/\\/g, '/')}（须本会话跑 /baf-quality:check 或等价 VERIFY_CMD）· 不得 archive`
      );
    } else if (ut.passed_tests === false) {
      out.blockers.push(
        `【阻塞】单元测试/质量门 · 变更 ${name} · passed_tests=false · ${UT_COVERAGE_REL.replace(/\\/g, '/')} · 不得 archive`
      );
    } else if (ut.passed_tests == null) {
      out.warnings.push(
        `【警告】UT/质量门 · ${UT_COVERAGE_REL.replace(/\\/g, '/')} 存在但无法解析 passed_tests`
      );
    } else if (isUtStale(ut.generated_at, createdAt)) {
      out.blockers.push(
        `【阻塞】单元测试/质量门 · 变更 ${name} · ut-coverage.json 早于变更创建日（generated_at=${ut.generated_at} · created_at=${createdAt}）· 须本会话重跑 /baf-quality:check · 不得 archive`
      );
    }

    const sa = readStaticAnalysis(projectRoot);
    if (!sa.exists) {
      out.blockers.push(
        `【阻塞】静态分析 · 变更 ${name} · 缺少 ${STATIC_ANALYSIS_REL.replace(/\\/g, '/')}（须本会话跑 /baf-quality:lint）· 不得 archive`
      );
    } else if (sa.passed === false) {
      out.warnings.push(
        `【警告】静态分析 · 变更 ${name} · passed=false · ${STATIC_ANALYSIS_REL.replace(/\\/g, '/')} · shadow 下不阻断；升格 fail-closed / --strict 后将阻塞 · 下一步：修告警后重跑 lint → 最终 clang-format`
      );
    } else if (sa.passed == null) {
      out.warnings.push(
        `【警告】静态分析 · ${STATIC_ANALYSIS_REL.replace(/\\/g, '/')} 存在但无法解析 passed`
      );
    } else if (isUtStale(sa.generated_at, createdAt)) {
      out.blockers.push(
        `【阻塞】静态分析 · 变更 ${name} · static-analysis.json 早于变更创建日（generated_at=${sa.generated_at} · created_at=${createdAt}）· 须本会话重跑 /baf-quality:lint · 不得 archive`
      );
    }
  }

  // Archive-phase: machine-readable squash gate (base-ref..HEAD ≤ max).
  if (String(phase).toLowerCase() === 'archive') {
    const max = flags.commitSpanMax == null ? 3 : Number(flags.commitSpanMax);
    if (!baseRef || !String(baseRef).trim()) {
      out.blockers.push(
        `【阻塞】压笔 · 变更 ${name} · 缺少 base_ref · 须 squash 后重跑 status · 不得展示归档交付选项 / 不得 archive`
      );
    } else {
      const spanFn = flags.checkCommitSpanFn || checkCommitSpan;
      const spanOpts = {
        projectRoot,
        baseRef: String(baseRef).trim(),
        max,
      };
      if (flags.commitSpanRunFn) spanOpts.runFn = flags.commitSpanRunFn;
      const span = spanFn(spanOpts);
      if (!span || span.ok !== true) {
        const countPart =
          span && span.count != null ? `commits=${span.count} > max ${span.max ?? max}` : null;
        const detail =
          countPart ||
          (span && span.message
            ? String(span.message).split(/\r?\n/)[0]
            : '笔数检查失败');
        out.blockers.push(
          `【阻塞】压笔 · 变更 ${name} · ${detail} · 须 squash 后重跑 status · 不得展示归档交付选项 / 不得 archive`
        );
      }
    }
  }
}

/**
 * Format human-readable section lines.
 * @param {{ blockers: string[], warnings: string[], ok: boolean, hasActive: boolean }} data
 * @returns {string[]}
 */
function formatBlockerLines(data) {
  const lines = [];
  if (!data.hasActive && data.blockers.length === 0 && data.warnings.length === 0) {
    lines.push('── baf-workflow 流程阻塞 ──');
    lines.push('无活跃流程阻塞。');
    lines.push('── comet status ──');
    return lines;
  }

  lines.push('── baf-workflow 流程阻塞 ──');
  if (data.blockers.length === 0 && data.warnings.length === 0) {
    lines.push('无活跃流程阻塞。');
  } else {
    for (const b of data.blockers) lines.push(b);
    for (const w of data.warnings) lines.push(w);
    if (data.blockers.length > 0) {
      lines.push(
        '下一步：按【阻塞】补齐证据或修复编译/测试/格式/API 文档/压笔后重跑 status；通过后再推进 archive（不得先展示归档交付选项）。可用本命令复查。'
      );
    }
  }
  lines.push('── comet status ──');
  return lines;
}

/**
 * @param {string} projectRoot
 * @param {{
 *   whichFn?: Function,
 *   spawnFn?: Function,
 *   cometStatus?: object|null,
 *   skipClangFormat?: boolean,
 *   skipDocsApi?: boolean,
 *   checkCommitSpanFn?: Function,
 *   commitSpanRunFn?: Function,
 *   commitSpanMax?: number,
 * }} [opts]
 * @returns {{
 *   ok: boolean,
 *   blockers: string[],
 *   warnings: string[],
 *   lines: string[],
 *   cometStatus: object|null,
 *   cometError: string|null,
 * }}
 */
function collectStatusBlockers(projectRoot, opts = {}) {
  const blockers = [];
  const warnings = [];
  const root = path.resolve(projectRoot);

  const loaded = loadCometStatusJson(root, opts);
  if (loaded.error && !loaded.status) {
    blockers.push(`【阻塞】无法读取编排状态 · ${loaded.error}`);
  }

  const changes = listClassicChanges(loaded.status);
  const flags = {
    needsGate: false,
    whichFn: opts.whichFn,
    spawnFn: opts.spawnFn,
    skipClangFormat: opts.skipClangFormat === true,
    skipDocsApi: opts.skipDocsApi === true,
    checkCommitSpanFn: opts.checkCommitSpanFn,
    commitSpanRunFn: opts.commitSpanRunFn,
    commitSpanMax: opts.commitSpanMax,
  };
  for (const c of changes) {
    analyzeChange(c, root, { blockers, warnings }, flags);
  }

  // Global UT fail still blocks even with no active change (stale red report).
  const ut = readUtCoverage(root);
  if (!flags.needsGate) {
    if (ut.exists && ut.passed_tests === false) {
      blockers.push(
        `【阻塞】单元测试/质量门 · passed_tests=false · ${UT_COVERAGE_REL.replace(/\\/g, '/')}`
      );
    }
  }

  const buildCmd = resolveBuildCmdStatus(root);
  if (changes.length > 0) {
    if (buildCmd.status === 'todo') {
      warnings.push(
        `【警告】BUILD_CMD 未配置（${buildCmd.source} 仍为 TODO）· status 不自动跑编译，无法机判编译是否通过 · 请在 AGENTS.md / ci-index 填入可复现构建命令`
      );
    } else if (buildCmd.status === 'missing') {
      warnings.push(
        `【警告】未找到 BUILD_CMD 声明（AGENTS.md / ci-index）· status 不自动跑编译 · 配置后将强制要求构建 exit=0 证据`
      );
    }
  }

  const dedupe = (arr) => [...new Set(arr)];
  const data = {
    blockers: dedupe(blockers),
    warnings: dedupe(warnings),
    ok: dedupe(blockers).length === 0,
    hasActive: changes.length > 0,
  };

  return {
    ok: data.ok,
    blockers: data.blockers,
    warnings: data.warnings,
    lines: formatBlockerLines(data),
    cometStatus: loaded.status,
    cometError: loaded.error,
  };
}

module.exports = {
  collectStatusBlockers,
  loadCometStatusJson,
  listClassicChanges,
  checkBuildCmdTodo,
  readUtCoverage,
  readStaticAnalysis,
  analyzeChange,
  formatBlockerLines,
  readCometYamlScalars,
  needsQualityGate,
  isUtStale,
  resolveBuildCmdStatus,
  UT_COVERAGE_REL,
  STATIC_ANALYSIS_REL,
  CI_INDEX_REL,
};
