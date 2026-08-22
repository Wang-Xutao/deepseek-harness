/** Trailing Sora mark for the blank-session hero headline. */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SORA_MONO_DATA_URL } from './assets/sora-mono.ts'
import css from './HeroTrailingMark.module.css'

export type HeroTrailingMarkProps = PropsRuntime<'conversation.hero.brand.trailing'>

/**
 * Render the monochrome Sora mark after the hero headline.
 * @param props - brand-mark owner props from the conversation shell.
 */
export function HeroTrailingMark({ size, className }: HeroTrailingMarkProps) {
  const edge = size > 0 ? size : 28
  return (
    <img
      className={className ?? css.mark}
      src={SORA_MONO_DATA_URL}
      width={edge}
      height={edge}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
