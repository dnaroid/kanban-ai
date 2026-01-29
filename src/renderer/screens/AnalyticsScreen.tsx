import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import type { AnalyticsOverview, AnalyticsRunStats } from '../../shared/types/ipc'

type AnalyticsScreenProps = {
  projectId: string
  projectName: string
}

export function AnalyticsScreen({ projectId, projectName }: AnalyticsScreenProps) {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [runStats, setRunStats] = useState<AnalyticsRunStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')

  useEffect(() => {
    let isMounted = true
    const fetchAnalytics = async () => {
      setIsLoading(true)
      try {
        const range = {
          from: rangeFrom || undefined,
          to: rangeTo || undefined,
        }
        const [overviewResponse, runResponse] = await Promise.all([
          window.api.analytics.getOverview({ projectId, range }),
          window.api.analytics.getRunStats({ projectId, range }),
        ])
        if (isMounted) {
          setOverview(overviewResponse.overview)
          setRunStats(runResponse.stats)
        }
      } catch (error) {
        console.error('Failed to load analytics:', error)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchAnalytics()
    return () => {
      isMounted = false
    }
  }, [projectId, rangeFrom, rangeTo])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-white">Analytics</h2>
          <p className="text-sm text-slate-500">{projectName}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={rangeFrom}
            onChange={(event) => setRangeFrom(event.target.value)}
            className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
          />
          <input
            type="date"
            value={rangeTo}
            onChange={(event) => setRangeTo(event.target.value)}
            className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5" /> WIP
            </div>
            <div className="text-3xl font-semibold text-white">
              {overview ? overview.wipCount : '--'}
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Throughput / day</div>
            <div className="text-3xl font-semibold text-white">
              {overview ? overview.throughputPerDay.toFixed(2) : '--'}
            </div>
            <div className="text-xs text-slate-500">
              {overview ? `${overview.doneCount} done` : '—'}
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Created</div>
            <div className="text-3xl font-semibold text-white">
              {overview ? overview.createdCount : '--'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Lead time (hrs)</div>
            <div className="text-3xl font-semibold text-white">
              {overview ? overview.leadTimeHours.toFixed(1) : '--'}
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Cycle time (hrs)</div>
            <div className="text-3xl font-semibold text-white">
              {overview ? overview.cycleTimeHours.toFixed(1) : '--'}
            </div>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 space-y-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Runs</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4">
              <div className="text-xs text-slate-500">Success rate</div>
              <div className="text-2xl font-semibold text-white">
                {runStats ? `${(runStats.successRate * 100).toFixed(1)}%` : '--'}
              </div>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4">
              <div className="text-xs text-slate-500">Avg duration (sec)</div>
              <div className="text-2xl font-semibold text-white">
                {runStats ? runStats.avgDurationSec.toFixed(0) : '--'}
              </div>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total runs</div>
              <div className="text-2xl font-semibold text-white">
                {runStats ? runStats.totalRuns : '--'}
              </div>
            </div>
          </div>
          {isLoading && <div className="text-xs text-slate-500">Refreshing metrics...</div>}
        </div>

        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 space-y-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider">AI usage</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4">
              <div className="text-xs text-slate-500">Tokens in</div>
              <div className="text-2xl font-semibold text-white">
                {overview ? overview.aiTokensIn : '--'}
              </div>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4">
              <div className="text-xs text-slate-500">Tokens out</div>
              <div className="text-2xl font-semibold text-white">
                {overview ? overview.aiTokensOut : '--'}
              </div>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4">
              <div className="text-xs text-slate-500">Cost (USD)</div>
              <div className="text-2xl font-semibold text-white">
                {overview ? `$${overview.aiCostUsd.toFixed(4)}` : '--'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
