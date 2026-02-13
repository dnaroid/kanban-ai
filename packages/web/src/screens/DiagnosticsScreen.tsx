import { useState, useEffect } from 'react'
import { Terminal, Database, RefreshCw, Server, Cpu, Layers } from 'lucide-react'
import { cn } from '@web/lib/utils'

export function DiagnosticsScreen() {
  const [logTail, setLogTail] = useState<string[]>([])
  const [systemInfo, setSystemInfo] = useState<Record<string, unknown>>({})
  const [dbInfo, setDbInfo] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDiagnostics()
  }, [])

  const loadDiagnostics = async () => {
    try {
      setLoading(true)
      const [systemData, dbData, tailData] = await Promise.all([
        window.api.diagnostics.getSystemInfo(),
        window.api.diagnostics.getDbInfo(),
        window.api.diagnostics.getLogTail(200),
      ])
      setSystemInfo(systemData as Record<string, unknown>)
      setDbInfo(dbData as Record<string, unknown>)
      setLogTail(tailData)
    } catch (error) {
      console.error('Failed to load diagnostics:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const StatCard = ({
    title,
    icon: Icon,
    data,
    accent,
  }: {
    title: string
    icon: any
    data: Record<string, any>
    accent: string
  }) => (
    <div className="bg-[#11151C] border border-slate-800/50 rounded-2xl overflow-hidden shadow-xl">
      <div
        className={cn(
          'p-4 border-b border-slate-800/50 flex items-center gap-3 bg-gradient-to-r',
          accent
        )}
      >
        <Icon className="w-5 h-5 text-white" />
        <h3 className="font-bold text-white text-sm uppercase tracking-wider">{title}</h3>
      </div>
      <div className="p-6 space-y-3">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex justify-between items-center group">
            <dt className="text-slate-500 text-xs font-semibold capitalize tracking-wide">
              {key.replace(/([A-Z])/g, ' $1')}
            </dt>
            <dd className="font-mono text-[11px] text-slate-300 bg-slate-800/50 px-2.5 py-1 rounded-lg border border-slate-700/30 group-hover:border-blue-500/30 transition-colors">
              {key === 'dbSize' && typeof value === 'number' ? formatBytes(value) : String(value)}
            </dd>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">System Diagnostics</h2>
          <p className="text-slate-500 text-sm">Monitor core application services and health</p>
        </div>
        <button
          onClick={loadDiagnostics}
          disabled={loading}
          className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <StatCard
          title="Runtime"
          icon={Cpu}
          accent="from-blue-600/20 to-transparent"
          data={{
            platform: systemInfo.platform || '—',
            arch: systemInfo.arch || '—',
            electron: systemInfo.electronVersion || '—',
            chrome: systemInfo.chromeVersion || '—',
            node: systemInfo.nodeVersion || '—',
          }}
        />
        <StatCard
          title="Environment"
          icon={Server}
          accent="from-amber-600/20 to-transparent"
          data={{
            version: (systemInfo.appVersion as string) || '—',
            mode: (systemInfo.mode as string) || '—',
            secureStore: systemInfo.safeStorageAvailable ? 'Hardware Encrypted' : 'Mock/Standard',
          }}
        />
        <StatCard
          title="Persistence"
          icon={Database}
          accent="from-emerald-600/20 to-transparent"
          data={{
            projects: dbInfo.projectsCount ?? 0,
            tasks: dbInfo.tasksCount ?? 0,
            size: dbInfo.dbSize ?? 0,
            schema: dbInfo.lastMigration ?? 0,
          }}
        />
        <StatCard
          title="Infrastructure"
          icon={Layers}
          accent="from-purple-600/20 to-transparent"
          data={{
            userData: (systemInfo.userDataPath as string) || '—',
            database: (systemInfo.dbPath as string) || '—',
            logs: (systemInfo.logsPath as string) || '—',
          }}
        />
      </div>

      <div className="bg-[#11151C] border border-slate-800/50 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-800/50 flex items-center justify-between bg-slate-800/20">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-white text-sm uppercase tracking-wider">
              Main Process Logs (main.log)
            </h3>
          </div>
          <div className="flex gap-2 text-[10px] text-slate-500 font-mono">
            {logTail.length} lines captured
          </div>
        </div>
        <div className="p-2 bg-[#0B0E14]">
          <div className="font-mono text-[12px] h-96 overflow-y-auto custom-scrollbar p-4 space-y-1">
            {logTail.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-3">
                <Layers className="w-8 h-8 opacity-20" />
                <span>No log file entries found</span>
              </div>
            ) : (
              logTail.map((line, index) => {
                const isError = line.includes('[ERROR]')
                const isWarn = line.includes('[WARN]')
                return (
                  <div
                    key={index}
                    className={cn(
                      'py-0.5 px-2 rounded whitespace-pre-wrap transition-colors',
                      isError
                        ? 'text-red-400 bg-red-500/5'
                        : isWarn
                          ? 'text-amber-400 bg-amber-500/5'
                          : 'text-slate-300 hover:bg-slate-800/30'
                    )}
                  >
                    {line}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
