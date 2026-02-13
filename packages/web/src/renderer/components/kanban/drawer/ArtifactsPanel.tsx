import { useCallback, useEffect, useState } from 'react'
import { Eye, FileCode, FileJson, Files, FileText, RefreshCw } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { Artifact } from '@shared/types/ipc.ts'

function ArtifactViewer({ artifact }: { artifact: Artifact }) {
  if (artifact.kind === 'json') {
    let formatted = artifact.content
    try {
      formatted = JSON.stringify(JSON.parse(artifact.content), null, 2)
    } catch {
      // ignore
    }

    return (
      <pre className="text-xs font-mono text-blue-300 whitespace-pre-wrap p-4 bg-slate-900/50 rounded-lg border border-slate-800/50 overflow-auto max-h-full custom-scrollbar selection:bg-blue-500/30">
        {formatted}
      </pre>
    )
  }

  if (artifact.kind === 'patch') {
    const lines = artifact.content.split('\n')
    return (
      <div className="font-mono text-xs overflow-auto max-h-full custom-scrollbar bg-slate-900/50 rounded-lg border border-slate-800/50 py-2">
        {lines.map((line, i) => {
          let className = 'text-slate-400 px-4 py-0.5 block'
          if (line.startsWith('+'))
            className =
              'text-emerald-400 bg-emerald-500/10 px-4 py-0.5 block border-l-2 border-emerald-500/50'
          if (line.startsWith('-'))
            className = 'text-red-400 bg-red-500/10 px-4 py-0.5 block border-l-2 border-red-500/50'
          if (line.startsWith('@@'))
            className = 'text-blue-400/70 bg-blue-500/10 px-4 py-0.5 block italic'
          if (
            line.startsWith('diff') ||
            line.startsWith('index') ||
            line.startsWith('---') ||
            line.startsWith('+++')
          )
            className = 'text-slate-500 px-4 py-0.5 block font-bold'
          return (
            <span key={i} className={className}>
              {line}
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div className="text-sm text-slate-300 overflow-auto max-h-full custom-scrollbar p-4 bg-slate-900/50 rounded-lg border border-slate-800/50">
      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed selection:bg-blue-500/30">
        {artifact.content}
      </pre>
    </div>
  )
}

export function ArtifactsPanel({ runId }: { runId: string }) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchArtifacts = useCallback(
    async (isAuto = false) => {
      if (!isAuto) setIsLoading(true)
      try {
        const response = await window.api.artifact.list({ runId })
        setArtifacts(response.artifacts)
        if (response.artifacts.length > 0 && !selectedArtifactId) {
          setSelectedArtifactId(response.artifacts[0].id)
        }
      } catch (error) {
        console.error('Failed to fetch artifacts:', error)
      } finally {
        setIsLoading(false)
      }
    },
    [runId, selectedArtifactId]
  )

  useEffect(() => {
    fetchArtifacts()
  }, [runId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedArtifactId) return
    let isActive = true
    const fetchContent = async () => {
      try {
        const response = await window.api.artifact.get({ artifactId: selectedArtifactId })
        if (!isActive) return
        setSelectedArtifact(response.artifact)
      } catch (error) {
        console.error('Failed to fetch artifact content:', error)
      }
    }
    fetchContent()
    return () => {
      isActive = false
    }
  }, [selectedArtifactId])

  if (isLoading && artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-3 opacity-50">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        <p className="text-xs text-slate-400 font-mono uppercase tracking-widest">
          Loading Artifacts...
        </p>
      </div>
    )
  }

  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-2 opacity-30">
        <Files className="w-8 h-8" />
        <p className="text-xs text-slate-400 font-mono">No artifacts found for this run</p>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden animate-in fade-in duration-300">
      <div className="w-44 border-r border-slate-800/50 flex flex-col bg-slate-900/10 shrink-0">
        <div className="p-3 border-b border-slate-800/50 bg-slate-800/20 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Files className="w-3 h-3" />
            Items ({artifacts.length})
          </span>
          <button
            onClick={() => fetchArtifacts()}
            className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded transition-colors"
            title="Refresh artifacts"
          >
            <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {artifacts.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedArtifactId(a.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg transition-all group relative overflow-hidden text-[11px]',
                selectedArtifactId === a.id
                  ? 'bg-blue-600/20 border border-blue-500/30 text-blue-300'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
              )}
            >
              <div className="flex items-center gap-2 relative z-10">
                {a.kind === 'json' && <FileJson className="w-3 h-3 shrink-0 opacity-70" />}
                {a.kind === 'patch' && <FileCode className="w-3 h-3 shrink-0 opacity-70" />}
                {a.kind === 'markdown' && <FileText className="w-3 h-3 shrink-0 opacity-70" />}
                <span className="font-medium truncate">{a.title}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col bg-[#0B0E14]/40">
        {selectedArtifact ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-slate-800/30 flex items-center justify-between bg-slate-900/20 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">
                  {selectedArtifact.title}
                </span>
                <span className="text-[9px] font-mono text-slate-500 uppercase px-1.5 py-0.5 bg-slate-800/50 rounded border border-slate-700/50 tracking-tighter">
                  {selectedArtifact.kind}
                </span>
              </div>
              <span className="text-[9px] text-slate-600 font-mono">
                {new Date(selectedArtifact.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <ArtifactViewer artifact={selectedArtifact} />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center space-y-2 opacity-30">
            <Eye className="w-8 h-8 text-slate-700" />
            <p className="text-xs text-slate-500 font-mono italic">Select an artifact to view</p>
          </div>
        )}
      </div>
    </div>
  )
}
