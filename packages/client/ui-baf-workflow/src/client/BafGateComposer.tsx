/**
 * 【变更】2026-09-25 (用户需求 工作流 1/2): the unified BAF workflow session card.
 *
 * A composer-chain entry (priority -10 — tried before ui-user-questions'
 * default-0 entry) that elects every `header: 'BAF 工作流'` pending question
 * and renders it as ONE BAF-styled card: gold-accent frame, the gate title,
 * the customer copy, and one-click option buttons (no custom text, no
 * pager, no skip, no 将执行 /baf-… dispatch detail — the generic
 * QuestionComposer keeps every non-BAF question, business 选择卡 included).
 *
 * While the workflow Tab is the active conversation view for the same
 * session, this component renders null: the decision moves to the Tab's TOP
 * dialog (用户需求 工作流 1 — the session-form dialog hides; the Tab answers
 * through the same carrier). useSyncExternalStore over tab-activity keeps
 * the flip instant in both directions.
 *
 * 【变更】2026-09-28 (用户问题 1): the card renders as a blocking modal.
 * 【变更】2026-09-28 (用户问题 1.4): the modal anchors to the CONVERSATION
 * PANE, not the viewport — a zero-height sentinel in the composer seat walks
 * up to `[data-conversation-content]`, and the fixed overlay is sized to that
 * pane's live rect (ResizeObserver + capture-phase scroll + window resize;
 * fullscreen fallback when the pane is not found). The sidebar and other
 * panes stay interactive; only the conversation hosting the gate is blocked.
 * The dialog intentionally offers no dismiss path: a parked gate only exits
 * through its answer buttons.
 *
 * 【变更】2026-09-28 (用户问题 1.1/1.2/1.5/1.6/1.7): body copy renders the
 * gate-dialog wire protocol — 【…】 sections with `- ` lists (1.1), the
 * `{{change:…}}` chip pinned to the header row's right (1.2), `{{art:…}}`
 * rows as openable document chips (1.5 — needs the {@link openArtifact}
 * channel), horizontal options with the confirm button emphasized (1.6),
 * and the revision textarea (1.7 — submits the platform `custom` answer;
 * the host dispatches a revision work order and the gate re-pops after the
 * model reworks the artifact).
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { answerGateOption, answerGateRevision, gateAskViewOf, isSecondaryOptionLabel, type GateAskCarrier } from './gate-ask.ts'
import { isWorkflowTabActive, subscribeTabActivity } from './tab-activity.ts'
import css from './BafGateComposer.module.css'

/** Props of the elected composer entry (owner share + the `matched` carrier). */
export interface BafGateComposerProps {
  /** The elected carrier (the selector's non-null return). */
  matched: GateAskCarrier
  /** Owner share: the session the pending interaction belongs to. */
  sessionId: SessionId | undefined
  /**
   * 【变更】2026-09-28 (用户问题 1.5): open a change artifact (workspace-relative
   * path) in the right sidebar. Wired by the client entry from
   * `ctx.sidebarRight.openResource`; absent in tests/hosts without it —
   * artifact rows then render as plain (non-clickable) chips.
   */
  readonly openArtifact?: (path: string) => void
}

/**
 * Measure the conversation pane a composer-seat node sits in (用户问题 1.4).
 * Tracks the pane's live viewport rect (ResizeObserver + any scroll event,
 * capture-phase so nested scrollers are heard, + window resize). Returns
 * null until measured or when no pane is found (fullscreen fallback).
 */
function useConversationPaneRect(sentinel: React.RefObject<HTMLDivElement | null>): {
  readonly rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number } | null
} {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useEffect(() => {
    const node = sentinel.current
    if (node === null) return
    const pane = node.closest('[data-conversation-content]')
    if (pane === null) {
      setRect(null)
      return
    }
    const measure = (): void => {
      const r = pane.getBoundingClientRect()
      setRect(prev =>
        prev !== null && prev.left === r.left && prev.top === r.top && prev.width === r.width && prev.height === r.height
          ? prev
          : { left: r.left, top: r.top, width: r.width, height: r.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    window.addEventListener('resize', measure)
    // Capture-phase: the conversation's own scroller is a descendant of the
    // pane, so its scroll events do not reach window bubbling — capture hears
    // them and keeps the overlay locked to the pane.
    window.addEventListener('scroll', measure, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [sentinel])
  return { rect }
}

/**
 * Wrap {@link BafGateComposer} with the artifact-opening channel (用户问题
 * 1.5). The entry registration (client index.ts) stays JSX-free; this factory
 * binds each render's carrier session to the ctx-level opener the workflow
 * Tab already uses (`ctx.sidebarRight.openResource`).
 * @param open - opens a workspace-relative path for one session.
 * @returns the bound component.
 */
export function bindGateOpenArtifact(
  open: (sessionId: string, path: string) => void,
): (props: BafGateComposerProps) => React.ReactElement | null {
  return function BafGateComposerBound(props: BafGateComposerProps): React.ReactElement | null {
    const sessionId = props.matched.sessionId
    return (
      <BafGateComposer
        {...props}
        openArtifact={(path) => { open(sessionId, path) }}
      />
    )
  }
}

/**
 * Render the unified BAF gate card, or nothing while the workflow Tab owns
 * the decision surface for this session.
 * @param props - see {@link BafGateComposerProps}.
 * @returns the card element, or null.
 */
export function BafGateComposer(props: BafGateComposerProps): React.ReactElement | null {
  const { matched, sessionId, openArtifact } = props
  const tabActive = useSyncExternalStore(
    subscribeTabActivity,
    () => sessionId !== undefined && isWorkflowTabActive(sessionId),
    () => false,
  )
  const [answered, setAnswered] = useState<string | null>(null)
  const [reviseText, setReviseText] = useState('')
  const seatRef = useRef<HTMLDivElement | null>(null)
  const { rect: paneRect } = useConversationPaneRect(seatRef)
  const reviseInputId = useId()
  if (tabActive) return null
  const view = gateAskViewOf(matched)
  if (view.options.length === 0) return null
  const disabled = answered !== null
  const primaryLabel = view.options.find(opt => !isSecondaryOptionLabel(opt.label))?.label
  // 用户问题 1.4: pin the overlay to the conversation pane's viewport rect;
  // inline left/top/width/height win over the stylesheet's `inset: 0`
  // (over-constrained edges drop), and null falls back to fullscreen.
  const overlayStyle = paneRect === null ? undefined : {
    left: `${paneRect.left}px`,
    top: `${paneRect.top}px`,
    width: `${paneRect.width}px`,
    height: `${paneRect.height}px`,
  }
  return (
    <>
      {/* Zero-footprint sentinel — the anchor the overlay measures from. */}
      <div ref={seatRef} className={css.sentinel} aria-hidden="true" />
      <div
        className={css.overlay}
        style={overlayStyle}
        data-baf-gate-card=""
        role="dialog"
        aria-modal="true"
        aria-label={view.title}
      >
        <section className={css.frame}>
          <header className={css.headerRow}>
            <p className={css.eyebrow}>BAF 工作流</p>
            {/* 用户问题 1.2: the 变更 id is a fixed top-right chip — never
             * buried inside the body copy. */}
            {view.changeId !== undefined && (
              <span className={css.changeChip} data-baf-change-id={view.changeId}>变更 {view.changeId}</span>
            )}
          </header>
          <h2 className={css.title}>{view.title}</h2>
          {view.sections.map((section, si) => (
            <section key={si} className={css.bodySection}>
              {section.title !== undefined && <h3 className={css.sectionTitle}>{section.title}</h3>}
              {section.blocks.map((block, bi) => block.kind === 'text'
                ? <p key={bi} className={css.body}>{block.text}</p>
                : (
                  <ul key={bi} className={css.bodyList}>
                    {block.items.map((item, ii) => (
                      <li key={ii}>
                        {item.artifact === undefined
                          ? item.text
                          : (openArtifact !== undefined
                            ? (
                              <button
                                type="button"
                                className={css.artifactChip}
                                data-baf-artifact={item.artifact.path}
                                onClick={() => { openArtifact(item.artifact?.path ?? '') }}
                              >
                                📄 {item.artifact.label} ↗
                              </button>
                            )
                            : <span className={css.artifactChip}>📄 {item.artifact.label}</span>)}
                      </li>
                    ))}
                  </ul>
                ))}
            </section>
          ))}
          {/* 用户问题 1.6: horizontal row, confirm emphasized. */}
          <div className={css.options}>
            {view.options.map(opt => (
              <button
                key={opt.label}
                type="button"
                className={opt.label === primaryLabel ? css.primaryBtn : css.secondaryBtn}
                data-baf-gate-option={opt.label}
                disabled={disabled}
                onClick={() => {
                  setAnswered(opt.label)
                  answerGateOption(matched, view, opt.label)
                }}
              >
                <span className={css.optionLabel}>{opt.label}</span>
                {opt.hint !== undefined && <span className={css.optionHint}>{opt.hint}</span>}
              </button>
            ))}
          </div>
          {/* 用户问题 1.7: free-text revision → the host dispatches a work
           * order against the artifact; the gate re-pops after the rework. */}
          {view.allowsRevise && (
            <div className={css.revise}>
              <label className={css.reviseLabel} htmlFor={reviseInputId}>有修改意见？写下后提交，系统派单修订产物，改好后再次弹出确认</label>
              <textarea
                id={reviseInputId}
                className={css.reviseInput}
                rows={2}
                value={reviseText}
                placeholder="例如：Scope 里补充不改哪些；Why 一句话讲清目标"
                disabled={disabled}
                onChange={(event) => { setReviseText(event.target.value) }}
              />
              <button
                type="button"
                className={css.reviseSubmit}
                data-baf-revise-submit=""
                disabled={disabled || reviseText.trim() === ''}
                onClick={() => {
                  setAnswered('revise')
                  answerGateRevision(matched, view, reviseText)
                }}
              >
                提交修改意见
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
