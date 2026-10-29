/**
 * 【变更】2026-10-28 (批次三十三 · 用户问题 3): the flow notice card.
 *
 * The flow surface reported failures as a bare `<p class="hint">` carrying
 * whatever the host said. A gate refusal said everything — the ✗ mark, the
 * headline, the rule, the type, every missing item, every completion
 * condition, the artifact path, the next step — in ONE muted line at the top
 * of the page. The customer read a wall of text where the page should have
 * said 「something did not work, here is the one thing to know」.
 *
 * A notice is now ONE card with three seats:
 * - a TONE RULE on the leading edge (warn / ok),
 * - a GLYPH that carries the tone,
 * - a TITLE (what happened) and a SHORT body (why).
 *
 * The host does the summarizing (the notice never receives the host's raw
 * card); this component only presents what it is given.
 *
 * @module @deepseek-ai/dsh-client-ui-baf-workflow/client/FlowNotice
 */

import clsx from 'clsx'
import {
  IconCheckCircleOutlineRegular,
  IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './WorkflowView.module.css'

/** One flow notice's content. */
export interface FlowNoticeContent {
  /**
   * The tone — `warn` for a failure, `ok` for a result the customer asked
   * for, `syncing` for work that is on its way.
   */
  readonly kind: 'ok' | 'warn' | 'syncing'
  /** What happened, in the customer's terms. */
  readonly title: string
  /** Why, in the host's short words. */
  readonly text: string
}

/**
 * Render one flow notice card.
 * @param props - the notice's content and its test id.
 * @returns the notice card.
 */
export function FlowNotice(props: {
  notice: FlowNoticeContent
  testId: string
}): React.ReactElement {
  const { notice, testId } = props
  return (
    <div
      className={clsx(
        css.flowNotice,
        notice.kind === 'warn' ? css.flowNoticeWarn : notice.kind === 'ok' ? css.flowNoticeOk : css.flowNoticeSyncing,
      )}
      data-testid={testId}
      role="status"
    >
      {notice.kind === 'syncing'
        ? <span className={css.flowNoticeSpinner} aria-hidden />
        : (
          <span className={css.flowNoticeIcon} aria-hidden>
            {notice.kind === 'warn'
              ? <IconWarningTriangleOutlineRegular size={16} />
              : <IconCheckCircleOutlineRegular size={16} />}
          </span>
        )}
      <div className={css.flowNoticeBody}>
        <p className={css.flowNoticeTitle}>{notice.title}</p>
        <p className={css.flowNoticeText}>{notice.text}</p>
      </div>
    </div>
  )
}
