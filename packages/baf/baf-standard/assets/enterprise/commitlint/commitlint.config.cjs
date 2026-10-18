'use strict';

/**
 * SORA commitlint config — Conventional Commits required
 * (English type/scope; Chinese subject allowed; subject-case off);
 * Jira keys optional, but validated when present (Refs/Fixes/Closes or PROJ-123 token);
 * AI / tooling attribution trailers (Co-Authored-By, Generated with …) are rejected.
 *
 * Install: @commitlint/cli @commitlint/config-conventional
 */

const JIRA_KEY = /^[A-Z][A-Z0-9]+-\d+$/;
const LOOKS_LIKE_BAD_KEY = /\b(?:Refs|Fixes|Closes)\s*:\s*(\S+)/gi;
const AI_ATTRIBUTION =
  /Co-Authored-By\s*:|Generated with\s+|Made with\s+|Made-with\s*:/i;

function collectText(parsed) {
  return [parsed.header, parsed.body, parsed.footer].filter(Boolean).join('\n');
}

function ruleJiraKeyWhenPresent(parsed) {
  const text = collectText(parsed);
  if (!text) return [true];

  const footerRefs = [...text.matchAll(LOOKS_LIKE_BAD_KEY)];
  for (const m of footerRefs) {
    const key = m[1].replace(/[.,;)]$/, '');
    if (!JIRA_KEY.test(key)) {
      return [
        false,
        `Jira key "${key}" is invalid; use PROJ-123 after Refs/Fixes/Closes (optional overall)`,
      ];
    }
  }

  const upperStuck = text.match(/\b([A-Z][A-Z0-9]{1,10})(\d{1,6})\b/g);
  if (upperStuck) {
    for (const tok of upperStuck) {
      if (!JIRA_KEY.test(tok) && /^[A-Z]{2,}\d+$/.test(tok)) {
        return [false, `Jira-like token "${tok}" is invalid; use PROJ-123 (hyphen required)`];
      }
    }
  }

  return [true];
}

function ruleNoAiAttribution(parsed) {
  const text = collectText(parsed);
  if (!text) return [true];
  if (AI_ATTRIBUTION.test(text)) {
    return [
      false,
      'AI/tooling attribution forbidden; remove Co-Authored-By / Generated with … and commit as plain Conventional Commits',
    ];
  }
  return [true];
}

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'jira-key-when-present': (parsed) => ruleJiraKeyWhenPresent(parsed),
        'no-ai-attribution': (parsed) => ruleNoAiAttribution(parsed),
      },
    },
  ],
  rules: {
    'jira-key-when-present': [2, 'always'],
    'no-ai-attribution': [2, 'always'],
    'header-max-length': [2, 'always', 100],
    'subject-case': [0],
  },
};
