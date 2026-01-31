import {
  AlertTriangle,
  ArrowUpRight,
  Bug,
  Check,
  ChevronDown,
  Clock,
  FileText,
  HelpCircle,
  Pause,
  Play,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react'

export const difficultyConfig = {
  easy: {
    icon: Check,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
  },
  medium: {
    icon: ArrowUpRight,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
  },
  hard: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
  },
  epic: {
    icon: Zap,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    border: 'border-purple-400/20',
  },
} as const

export const priorityConfig = {
  postpone: {
    icon: Clock,
    color: 'text-slate-400',
    bg: 'bg-slate-400/10',
    border: 'border-slate-400/20',
  },
  low: {
    icon: ChevronDown,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
  },
  normal: {
    icon: ArrowUpRight,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
  },
  urgent: {
    icon: AlertTriangle,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/20',
  },
} as const

export const typeConfig = {
  feature: {
    icon: Sparkles,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    border: 'border-purple-400/20',
  },
  bug: { icon: Bug, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
  chore: {
    icon: FileText,
    color: 'text-slate-400',
    bg: 'bg-slate-400/10',
    border: 'border-slate-400/20',
  },
  improvement: {
    icon: ArrowUpRight,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
  },
} as const

export const statusConfig = {
  queued: {
    icon: Clock,
    color: 'text-slate-400',
    bg: 'bg-slate-400/10',
    border: 'border-slate-400/20',
  },
  running: {
    icon: Play,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
  },
  question: {
    icon: HelpCircle,
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    border: 'border-orange-400/20',
  },
  paused: {
    icon: Pause,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    border: 'border-yellow-400/20',
  },
  done: {
    icon: Check,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/20',
  },
} as const
