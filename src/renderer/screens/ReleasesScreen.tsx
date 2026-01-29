import { useEffect, useState } from 'react'
import { Calendar, FileText, Plus, Sparkles, Check, Layers } from 'lucide-react'
import type { Release, ReleaseItem } from '../../shared/types/ipc'
import { cn } from '../lib/utils'

type ReleasesScreenProps = {
  projectId: string
  projectName: string
}

export function ReleasesScreen({ projectId, projectName }: ReleasesScreenProps) {
  const [releases, setReleases] = useState<Release[]>([])
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null)
  const [items, setItems] = useState<ReleaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [releaseName, setReleaseName] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [taskIdsInput, setTaskIdsInput] = useState('')
  const [notes, setNotes] = useState('')
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadReleases = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.release.list({ projectId })
      setReleases(result.releases)
      if (!selectedRelease && result.releases.length > 0) {
        await loadRelease(result.releases[0].id)
      }
    } catch (err) {
      console.error('[Releases] Failed to load releases', err)
      setError('Failed to load releases')
    } finally {
      setLoading(false)
    }
  }

  const loadRelease = async (releaseId: string) => {
    try {
      const result = await window.api.release.get({ releaseId })
      setSelectedRelease(result.release)
      setItems(result.items)
      setNotes(result.release.notesMd)
    } catch (err) {
      console.error('[Releases] Failed to load release', err)
      setError('Failed to load release details')
    }
  }

  useEffect(() => {
    loadReleases()
  }, [projectId])

  const handleCreateRelease = async () => {
    if (!releaseName.trim() || isCreating) return
    setIsCreating(true)
    setError(null)
    try {
      const result = await window.api.release.create({
        projectId,
        name: releaseName.trim(),
        targetDate: targetDate.trim() ? targetDate.trim() : null,
      })
      setReleaseName('')
      setTargetDate('')
      await loadReleases()
      await loadRelease(result.releaseId)
    } catch (err) {
      console.error('[Releases] Failed to create release', err)
      setError('Failed to create release')
    } finally {
      setIsCreating(false)
    }
  }

  const handleAddItems = async () => {
    if (!selectedRelease) return
    const taskIds = taskIdsInput
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter(Boolean)
    if (taskIds.length === 0) return

    try {
      await window.api.release.addItems({ releaseId: selectedRelease.id, taskIds })
      setTaskIdsInput('')
      await loadRelease(selectedRelease.id)
    } catch (err) {
      console.error('[Releases] Failed to add items', err)
      setError('Failed to add items')
    }
  }

  const handleGenerateNotes = async () => {
    if (!selectedRelease) return
    try {
      const result = await window.api.release.generateNotes({ releaseId: selectedRelease.id })
      setRunId(result.runId)
    } catch (err) {
      console.error('[Releases] Failed to generate notes', err)
      setError('Failed to generate notes')
    }
  }

  const handlePublish = async () => {
    if (!selectedRelease) return
    try {
      await window.api.release.publish({ releaseId: selectedRelease.id, notesMd: notes })
      await loadRelease(selectedRelease.id)
    } catch (err) {
      console.error('[Releases] Failed to publish release', err)
      setError('Failed to publish release')
    }
  }

  return (
    <div className="flex h-full gap-6">
      <div className="w-[320px] flex-shrink-0 space-y-4">
        <div className="bg-[#11151C] border border-slate-800/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            <Layers className="w-4 h-4 text-blue-400" />
            Releases
          </div>
          <div className="text-sm text-slate-300">{projectName}</div>
        </div>

        <div className="bg-[#11151C] border border-slate-800/50 rounded-2xl p-4 space-y-3">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Create Release
          </div>
          <input
            value={releaseName}
            onChange={(event) => setReleaseName(event.target.value)}
            placeholder="Release name (v0.3.0)"
            className="w-full px-3 py-2 bg-[#0B0E14] border border-slate-800/60 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-600"
          />
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
              placeholder="Target date (YYYY-MM-DD)"
              className="w-full px-3 py-2 bg-[#0B0E14] border border-slate-800/60 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-600"
            />
          </div>
          <button
            onClick={handleCreateRelease}
            disabled={isCreating || !releaseName.trim()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            {isCreating ? 'Creating...' : 'Create'}
          </button>
        </div>

        <div className="bg-[#11151C] border border-slate-800/50 rounded-2xl p-4 space-y-3">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Releases
          </div>
          {loading && <div className="text-xs text-slate-500">Loading…</div>}
          {!loading && releases.length === 0 && (
            <div className="text-xs text-slate-500">No releases yet</div>
          )}
          <div className="space-y-2">
            {releases.map((release) => (
              <button
                key={release.id}
                onClick={() => loadRelease(release.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-xl border transition-all',
                  selectedRelease?.id === release.id
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                    : 'border-slate-800/60 bg-slate-900/40 text-slate-300 hover:bg-slate-800/50'
                )}
              >
                <div className="text-sm font-medium">{release.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500">
                  {release.status}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 bg-[#11151C] border border-slate-800/50 rounded-2xl p-6 flex flex-col gap-6">
        {selectedRelease ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-slate-500">Release</div>
                <div className="text-2xl font-semibold text-white">{selectedRelease.name}</div>
              </div>
              <span className="text-[10px] uppercase tracking-widest text-slate-500">
                Status: {selectedRelease.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#0B0E14] border border-slate-800/50 rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                  Items
                </div>
                <div className="space-y-2 max-h-48 overflow-auto">
                  {items.map((item) => (
                    <div key={item.id} className="text-xs text-slate-300 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-600" />
                      {item.taskId}
                    </div>
                  ))}
                  {items.length === 0 && <div className="text-xs text-slate-500">No items</div>}
                </div>
                <div className="mt-4 space-y-2">
                  <input
                    value={taskIdsInput}
                    onChange={(event) => setTaskIdsInput(event.target.value)}
                    placeholder="Add task IDs (comma/space)"
                    className="w-full px-3 py-2 bg-[#0B0E14] border border-slate-800/60 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-600"
                  />
                  <button
                    onClick={handleAddItems}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Items
                  </button>
                </div>
              </div>

              <div className="bg-[#0B0E14] border border-slate-800/50 rounded-xl p-4 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">
                    Release Notes
                  </div>
                  {runId && (
                    <div className="text-[10px] text-slate-500 font-mono">
                      Run {runId.slice(0, 8)}…
                    </div>
                  )}
                </div>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Generated notes will appear here"
                  className="flex-1 min-h-[200px] w-full px-3 py-2 bg-[#0B0E14] border border-slate-800/60 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-600 resize-none"
                />
                <div className="mt-3 flex gap-3">
                  <button
                    onClick={handleGenerateNotes}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600/80 hover:bg-indigo-500/80 text-white text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate
                  </button>
                  <button
                    onClick={handlePublish}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Publish
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <FileText className="w-6 h-6 mb-2" />
            Select a release to view details.
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl text-red-400 text-xs">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
