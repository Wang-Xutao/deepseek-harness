'use strict';

/**
 * Dry-run clang-format on changed self-owned .c/.h for Spec quality gates.
 * Does not modify files. Skips when no .clang-format or no matching changes.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SKIP_PATH_RE =
  /(^|[\\/])(third_party|ThirdParty|vendor|generated|build|\.git)([\\/]|$)/i;

/**
 * @param {string} cmd
 * @param {Function} [whichFn]
 * @returns {string}
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
 * @param {string[]} args
 * @param {Function} [spawnFn]
 * @returns {{ status: number|null, stdout: string, stderr: string }}
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
function isChFile(name) {
  return /\.(c|h)$/i.test(name) && !SKIP_PATH_RE.test(name.replace(/\\/g, '/'));
}

/**
 * Collect .c/.h touched vs baseRef (or working tree if no base).
 * @param {string} projectRoot
 * @param {{ baseRef?: string|null, spawnFn?: Function }} [opts]
 * @returns {string[]} relative posix-ish paths
 */
function listChangedChFiles(projectRoot, opts = {}) {
  const spawnFn = opts.spawnFn;
  const names = new Set();
  const addLines = (text) => {
    for (const line of (text || '').split(/\r?\n/)) {
      const n = line.trim().replace(/\\/g, '/');
      if (n && isChFile(n)) names.add(n);
    }
  };

  const baseRef = opts.baseRef && String(opts.baseRef).trim();
  if (baseRef) {
    const ranged = git(projectRoot, ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`], spawnFn);
    if (ranged.status === 0) addLines(ranged.stdout);
    else {
      const fallback = git(projectRoot, ['diff', '--name-only', '--diff-filter=ACMR', baseRef], spawnFn);
      if (fallback.status === 0) addLines(fallback.stdout);
    }
  }

  const unstaged = git(projectRoot, ['diff', '--name-only', '--diff-filter=ACMR'], spawnFn);
  if (unstaged.status === 0) addLines(unstaged.stdout);
  const staged = git(projectRoot, ['diff', '--name-only', '--cached', '--diff-filter=ACMR'], spawnFn);
  if (staged.status === 0) addLines(staged.stdout);

  // Untracked new .c/.h under source/ (common for new modules)
  const untracked = git(
    projectRoot,
    ['ls-files', '--others', '--exclude-standard', '--', '*.c', '*.h', 'source', 'test'],
    spawnFn
  );
  if (untracked.status === 0) addLines(untracked.stdout);

  return [...names].sort();
}

/**
 * @param {string} projectRoot
 * @param {{
 *   baseRef?: string|null,
 *   whichFn?: Function,
 *   spawnFn?: Function,
 *   skipIfNoConfig?: boolean,
 * }} [opts]
 * @returns {{
 *   ok: boolean,
 *   skipped: boolean,
 *   reason: string|null,
 *   files: string[],
 *   dirty: string[],
 *   blocker: string|null,
 *   warning: string|null,
 * }}
 */
function checkClangFormat(projectRoot, opts = {}) {
  const root = path.resolve(projectRoot);
  const cfg = path.join(root, '.clang-format');
  if (!fs.existsSync(cfg)) {
    return {
      ok: true,
      skipped: true,
      reason: 'no .clang-format',
      files: [],
      dirty: [],
      blocker: null,
      warning:
        opts.skipIfNoConfig === false
          ? '【警告】缺 .clang-format · 无法机检格式；建议 /baf-standard:apply-c-templates'
          : null,
    };
  }

  const bin = which('clang-format', opts.whichFn);
  if (!bin) {
    return {
      ok: false,
      skipped: false,
      reason: 'clang-format missing',
      files: [],
      dirty: [],
      blocker:
        '【阻塞】代码格式 · clang-format 不在 PATH · 不得宣称验证完成 / 不得 archive · 下一步：安装 clang-format 后对改动 .c/.h 执行 clang-format -i，再重跑检查',
      warning: null,
    };
  }

  const files = listChangedChFiles(root, {
    baseRef: opts.baseRef,
    spawnFn: opts.spawnFn,
  }).filter((rel) => fs.existsSync(path.join(root, rel)));

  if (!files.length) {
    return {
      ok: true,
      skipped: true,
      reason: 'no changed .c/.h',
      files: [],
      dirty: [],
      blocker: null,
      warning: null,
    };
  }

  const run = opts.spawnFn || spawnSync;
  const dirty = [];
  // Batch in chunks to avoid command-line length limits
  const chunkSize = 40;
  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize);
    const r = run(bin, ['--dry-run', '-Werror', ...chunk], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
    });
    if (r.status !== 0) {
      const text = `${r.stdout || ''}\n${r.stderr || ''}`;
      for (const f of chunk) {
        if (text.includes(f) || text.includes(f.replace(/\//g, '\\'))) {
          dirty.push(f);
        }
      }
      if (!dirty.length) {
        // Tool failed without naming files — treat whole chunk as needing format
        dirty.push(...chunk);
      }
    }
  }

  const uniqDirty = [...new Set(dirty)];
  if (uniqDirty.length) {
    const sample = uniqDirty.slice(0, 5).join(', ');
    const more = uniqDirty.length > 5 ? ` 等 ${uniqDirty.length} 个文件` : '';
    return {
      ok: false,
      skipped: false,
      reason: 'format dirty',
      files,
      dirty: uniqDirty,
      blocker: `【阻塞】代码格式 · 改动 .c/.h 未通过 clang-format 检查（${sample}${more}）· 不得宣称验证完成 / 不得 archive · 下一步：clang-format -i <上述文件> 后重跑 /baf-workflow:status`,
      warning: null,
    };
  }

  return {
    ok: true,
    skipped: false,
    reason: null,
    files,
    dirty: [],
    blocker: null,
    warning: null,
  };
}

module.exports = {
  checkClangFormat,
  listChangedChFiles,
  isChFile,
  SKIP_PATH_RE,
};
