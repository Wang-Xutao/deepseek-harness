'use strict';

/**
 * Check how many commits exist since a base ref (plan base-ref).
 * Used before archive/push to enforce squash / few-commit policy.
 */

const { spawnSync } = require('child_process');

function defaultRun(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    cwd: opts.cwd,
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  return {
    status: r.status == null ? 1 : r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

/**
 * @param {{
 *   projectRoot?: string,
 *   baseRef: string,
 *   max?: number,
 *   runFn?: Function,
 * }} opts
 */
function checkCommitSpan(opts) {
  const root = opts.projectRoot || process.cwd();
  const baseRef = String(opts.baseRef || '').trim();
  const max = opts.max == null ? 3 : Number(opts.max);
  const runFn = opts.runFn || defaultRun;

  if (!baseRef) {
    return {
      ok: false,
      exitCode: 2,
      count: null,
      max,
      message: '缺少 --base-ref（通常取 plan 文件头 base-ref）',
    };
  }
  if (!Number.isFinite(max) || max < 1) {
    return {
      ok: false,
      exitCode: 2,
      count: null,
      max,
      message: `--max 无效: ${opts.max}`,
    };
  }

  const verify = runFn('git', ['rev-parse', '--verify', `${baseRef}^{commit}`], {
    cwd: root,
  });
  if (verify.status !== 0) {
    return {
      ok: false,
      exitCode: 2,
      count: null,
      max,
      baseRef,
      message: `base-ref 无效或不可解析: ${baseRef}`,
    };
  }

  const counted = runFn('git', ['rev-list', '--count', `${baseRef}..HEAD`], { cwd: root });
  if (counted.status !== 0) {
    return {
      ok: false,
      exitCode: 2,
      count: null,
      max,
      baseRef,
      message: `git rev-list 失败: ${(counted.stderr || counted.stdout || '').trim()}`,
    };
  }

  const count = parseInt(String(counted.stdout || '').trim(), 10);
  if (!Number.isFinite(count)) {
    return {
      ok: false,
      exitCode: 2,
      count: null,
      max,
      baseRef,
      message: `无法解析提交笔数: ${counted.stdout}`,
    };
  }

  const ok = count <= max;
  const lines = [
    `── check-commit-span ──`,
    `base-ref: ${baseRef}`,
    `commits:  ${count}  (max ${max})`,
    ok
      ? `✅ 笔数合格（构建期可碎交；归档/push 前已压到 ≤${max}）`
      : `❌ 笔数过多：请在归档/push 前 squash 至 ≤${max} 笔，最终 subject 默认中文（sora-commit-standards）`,
  ];
  if (!ok) {
    lines.push('');
    lines.push('建议（未 push 时，须用户确认后再改写历史）：');
    lines.push(`  git reset --soft ${baseRef}`);
    lines.push('  git commit -m "feat(scope): 中文概述本变更"');
    lines.push('若已 push：先征得用户确认，再交互式 rebase / squash，禁止擅自 force push。');
  }

  return {
    ok,
    exitCode: ok ? 0 : 1,
    count,
    max,
    baseRef,
    message: lines.join('\n'),
  };
}

module.exports = { checkCommitSpan, defaultRun };
