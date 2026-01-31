import { useState } from 'react'
import { Files, Terminal, X } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { Run } from '@/shared/types/ipc.ts'
import { ArtifactsPanel } from './ArtifactsPanel'
import { ExecutionLog } from './ExecutionLog'

export function RunDetailsView({
  runId,
  run,
  onBack,
}: {
  runId: string
  run: Run | null
  onBack: () => void
}) {
  const [view, setView] = useState<'log' | 'artifacts'>('log')

  const statusTone =
    run?.status === 'failed'
      ? 'text-red-400 border-red-500/20 bg-red-500/10'
      : run?.status === 'canceled'
        ? 'text-slate-400 border-slate-500/20 bg-slate-500/10'
        : run?.status === 'queued'
          ? 'text-amber-400 border-amber-500/20 bg-amber-500/10'
          : 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10'

  const statusDot =
    run?.status === 'failed'
      ? 'bg-red-500'
      : run?.status === 'canceled'
        ? 'bg-slate-400'
        : run?.status === 'queued'
          ? 'bg-amber-500'
          : 'bg-emerald-500'

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] overflow-hidden animate-in fade-in duration-300">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/50 bg-[#11151C]/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Execution View
            </span>
            <span className="text-xs font-mono text-blue-400/80">{runId.slice(0, 8)}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-slate-900/80 rounded-lg p-0.5 border border-slate-800/50 shadow-inner">
            <button
              onClick={() => setView('log')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200',
                view === 'log'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <Terminal className="w-3 h-3" />
              Log
            </button>
            <button
              onClick={() => setView('artifacts')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200',
                view === 'artifacts'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <Files className="w-3 h-3" />
              Artifacts
            </button>
          </div>

          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border',
              statusTone
            )}
          >
            <div
              className={cn(
                'w-1 h-1 rounded-full',
                statusDot,
                run?.status === 'running' && 'animate-pulse'
              )}
            />
            {run?.status ?? 'running'}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === 'log' ? <ExecutionLog runId={runId} /> : <ArtifactsPanel runId={runId} />}
      </div>
    </div>
  )
}
