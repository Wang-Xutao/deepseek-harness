'use strict';

/**
 * Spec quality gate: public C headers / module README / docs/api/site sync.
 * Read-only — does not run doxygen (Agent must run baf-standard docs-doxygen).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { listChangedChFiles, SKIP_PATH_RE } = require('./check-clang-format.cjs');

const SITE_INDEX_REL = path.join('docs', 'api', 'site', 'index.html');
const SITE_DIR_REL = path.join('docs', 'api', 'site');
const API_README_REL = path.join('docs', 'api', 'README.md');

/**
 * @param {string} projectRoot
 * @param {string[]} args
 * @param {Function} [spawnFn]
 */
function git(projectRoot, args, spawnFn) {
  const run = spawnFn || spawnSync;
  const r = run('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    status: r.status == null ? 1 : r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isPublicHeader(name) {
  const n = name.replace(/\\/g, '/');
  return /\.h$/i.test(n) && !SKIP_PATH_RE.test(n);
}

/**
 * @param {string} projectRoot
 * @param {{ baseRef?: string|null, spawnFn?: Function }} [opts]
 * @returns {string[]}
 */
function listChangedPublicHeaders(projectRoot, opts = {}) {
  return listChangedChFiles(projectRoot, opts).filter(isPublicHeader);
}

/**
 * Any path under docs/api/site changed vs base / working tree.
 * @param {string} projectRoot
 * @param {{ baseRef?: string|null, spawnFn?: Function }} [opts]
 * @returns {string[]}
 */
function listChangedSiteFiles(projectRoot, opts = {}) {
  const spawnFn = opts.spawnFn;
  const names = new Set();
  const addLines = (text) => {
    for (const line of (text || '').split(/\r?\n/)) {
      const n = line.trim().replace(/\\/g, '/');
      if (n && /(^|\/)docs\/api\/site(\/|$)/i.test(n)) names.add(n);
    }
  };

  const baseRef = opts.baseRef && String(opts.baseRef).trim();
  if (baseRef) {
    const ranged = git(
      projectRoot,
      ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`, '--', 'docs/api/site'],
      spawnFn
    );
    if (ranged.status === 0) addLines(ranged.stdout);
    else {
      const fb = git(
        projectRoot,
        ['diff', '--name-only', '--diff-filter=ACMR', baseRef, '--', 'docs/api/site'],
        spawnFn
      );
      if (fb.status === 0) addLines(fb.stdout);
    }
  }

  for (const extra of [
    ['diff', '--name-only', '--diff-filter=ACMR', '--', 'docs/api/site'],
    ['diff', '--name-only', '--cached', '--diff-filter=ACMR', '--', 'docs/api/site'],
    ['ls-files', '--others', '--exclude-standard', '--', 'docs/api/site'],
  ]) {
    const r = git(projectRoot, extra, spawnFn);
    if (r.status === 0) addLines(r.stdout);
  }

  return [...names].sort();
}

/**
 * Module dirs (containing changed .h) missing README.md.
 * @param {string} projectRoot
 * @param {string[]} headers
 * @returns {string[]}
 */
function listModulesMissingReadme(projectRoot, headers) {
  const missing = new Set();
  for (const h of headers) {
    const dir = path.dirname(h).replace(/\\/g, '/');
    if (!dir || dir === '.') continue;
    const readme = path.join(projectRoot, dir, 'README.md');
    if (!fs.existsSync(readme)) missing.add(dir);
  }
  return [...missing].sort();
}

/**
 * @param {string} cmd
 * @param {Function} [whichFn]
 */
function which(cmd, whichFn) {
  if (whichFn) return whichFn(cmd) || '';
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
 * @param {string} projectRoot
 * @param {{
 *   baseRef?: string|null,
 *   whichFn?: Function,
 *   spawnFn?: Function,
 *   changeName?: string,
 * }} [opts]
 * @returns {{
 *   ok: boolean,
 *   skipped: boolean,
 *   headers: string[],
 *   siteFiles: string[],
 *   missingReadmes: string[],
 *   blockers: string[],
 *   warnings: string[],
 * }}
 */
function checkDocsApiGate(projectRoot, opts = {}) {
  const root = path.resolve(projectRoot);
  const label = opts.changeName ? `变更 ${opts.changeName} · ` : '';
  const blockers = [];
  const warnings = [];

  const headers = listChangedPublicHeaders(root, {
    baseRef: opts.baseRef,
    spawnFn: opts.spawnFn,
  });

  if (!headers.length) {
    return {
      ok: true,
      skipped: true,
      headers: [],
      siteFiles: [],
      missingReadmes: [],
      blockers: [],
      warnings: [],
    };
  }

  const missingReadmes = listModulesMissingReadme(root, headers);
  if (missingReadmes.length) {
    const sample = missingReadmes.slice(0, 3).join(', ');
    const more = missingReadmes.length > 3 ? ` 等 ${missingReadmes.length} 处` : '';
    blockers.push(
      `【阻塞】API 文档 · ${label}公开头所在模块缺 README.md（${sample}${more}）· 不得宣称验证完成 · 下一步：按 9 节模板补齐模块 README 后重跑 status`
    );
  }

  const apiReadme = path.join(root, API_README_REL);
  if (!fs.existsSync(apiReadme)) {
    warnings.push(
      `【警告】API 文档 · ${label}缺少 docs/api/README.md（仓级清单）· 建议 /baf-standard:apply-constitution 或补清单行`
    );
  }

  const doxyfile = path.join(root, 'Doxyfile');
  const siteIndex = path.join(root, SITE_INDEX_REL);
  const hasDoxyfile = fs.existsSync(doxyfile);

  if (!hasDoxyfile) {
    blockers.push(
      `【阻塞】API 文档 · ${label}已改公开头但缺仓根 Doxyfile · 不得宣称验证完成 · 下一步：baf-standard apply-c-templates（或复制 Doxyfile.example）后跑 baf-standard docs-doxygen`
    );
    return {
      ok: false,
      skipped: false,
      headers,
      siteFiles: [],
      missingReadmes,
      blockers,
      warnings,
    };
  }

  const dox = which('doxygen', opts.whichFn) || which('doxygen.exe', opts.whichFn);
  if (!dox) {
    blockers.push(
      `【阻塞】API 文档 · ${label}doxygen 不在 PATH · 无法重生 docs/api/site/ · 不得宣称验证完成 · 下一步：安装 Doxygen 后执行 baf-standard docs-doxygen 并提交 site/`
    );
  }

  if (!fs.existsSync(siteIndex)) {
    blockers.push(
      `【阻塞】API 文档 · ${label}缺少 ${SITE_INDEX_REL.replace(/\\/g, '/')} · 下一步：baf-standard docs-doxygen 并提交 docs/api/site/`
    );
  }

  const siteFiles = listChangedSiteFiles(root, {
    baseRef: opts.baseRef,
    spawnFn: opts.spawnFn,
  });

  if (fs.existsSync(siteIndex) && siteFiles.length === 0) {
    blockers.push(
      `【阻塞】API 文档 · ${label}公开头已变更但 docs/api/site/ 相对 base-ref/工作区无更新 · 不得宣称验证完成 / 不得 archive · 下一步：baf-standard docs-doxygen，将 docs/api/site/ 纳入本变更后重跑 /baf-workflow:status`
    );
  }

  return {
    ok: blockers.length === 0,
    skipped: false,
    headers,
    siteFiles,
    missingReadmes,
    blockers,
    warnings,
  };
}

module.exports = {
  checkDocsApiGate,
  listChangedPublicHeaders,
  listChangedSiteFiles,
  listModulesMissingReadme,
  isPublicHeader,
  SITE_INDEX_REL,
  SITE_DIR_REL,
  API_README_REL,
};
