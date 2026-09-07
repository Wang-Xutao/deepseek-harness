/** Small SVG glyphs for workflow stage cards. */
import type { TerminalStateId, WorkflowNodeId } from './tab-types.ts'

const common = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  'aria-hidden': true as const,
}

/** Icon for one workflow node or terminal. */
export function NodeIcon({ id }: { id: WorkflowNodeId | TerminalStateId }): React.ReactElement {
  switch (id) {
    case 'intake':
      return (
        <svg {...common}>
          <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'open':
      return (
        <svg {...common}>
          <path d="M3 4h6l2 2v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.4" />
          <path d="M9 4v2h2" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )
    case 'clarify':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 7.2V11M8 5v.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'design':
      return (
        <svg {...common}>
          <path d="M3 12 9.5 5.5l2 2L5 14H3v-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="m10.2 4.8 1.5-1.5 2 2-1.5 1.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )
    case 'plan':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5 6.5h6M5 9.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'implement':
      return (
        <svg {...common}>
          <path d="M5 4 2.5 8 5 12M11 4l2.5 4L11 12M9 3.5 7 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'verify':
      return (
        <svg {...common}>
          <path d="M3.5 8.2 6.5 11l6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'archive':
      return (
        <svg {...common}>
          <path d="M2.5 5h11v2H2.5V5zm1 2v6.5h9V7" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M6.5 10h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'drift':
      return (
        <svg {...common}>
          <path d="M3 11c2-4 3-6 5-6s3 2 5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="5" r="1.2" fill="currentColor" />
        </svg>
      )
    case 'completed':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="m5.5 8 1.8 1.8 3.4-3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'abandoned':
      return (
        <svg {...common}>
          <path d="M4 4l8 8M12 4 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2" fill="currentColor" />
        </svg>
      )
  }
}
