/**
 * Standalone settings section: open the BAF Feishu feedback form.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './UpdatesSection.module.css'

/** Feishu form for product feedback. */
const FEEDBACK_URL = 'https://lvoy7mafwvw.feishu.cn/share/base/form/shrcnavwRx2O9Jxf4tH8OTXaW2g'

export type FeedbackSectionProps =
  PropsRuntime<'settings.section'> & PropsLocale<'settings.updates'>

/**
 * Settings page body for user feedback.
 * @param props - settings section props with locale.
 */
export function FeedbackSection({ t }: FeedbackSectionProps) {
  return (
    <div className={css.section} data-testid="feedback-section">
      <h2 className={css.title}>{t('feedbackHeading')}</h2>
      <p className={css.intro}>{t('feedbackIntro')}</p>
      <div className={css.actions}>
        <a
          className={css.btn}
          href={FEEDBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="updates-feedback-link"
        >
          {t('feedbackButton')}
        </a>
      </div>
    </div>
  )
}
