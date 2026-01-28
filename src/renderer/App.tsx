import {useState} from "react"
import {Activity, AlertTriangle, ChevronRight, Database, FolderKanban, Github, Layout, Settings} from "lucide-react"
import {ProjectsScreen} from "./screens/ProjectsScreen"
import {DiagnosticsScreen} from "./screens/DiagnosticsScreen"
import {BoardScreen} from "./screens/BoardScreen"
import {cn} from "./lib/utils"

type Screen =
  | { id: "projects" }
  | { id: "diagnostics" }
  | { id: "board", projectId: string, projectName: string }

export default function App() {
  const [screen, setScreen] = useState<Screen>({id: "projects"})

  const navItems = [
    {id: "projects" as const, label: "Projects", icon: FolderKanban},
    {id: "diagnostics" as const, label: "Diagnostics", icon: Activity},
  ]
  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Sidebar Navigation */}
      <aside className="fixed top-0 left-0 h-full w-64 bg-[#11151C] border-r border-slate-800/50 flex flex-col z-50">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800/50">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Layout className="w-5 h-5 text-white"/>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Kanban AI</h1>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Beta v0.1.0</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 mt-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = screen.id === item.id
            return (
              <button
                key={item.id}
                onClick={() => setScreen({id: item.id})}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                  isActive
                    ? "bg-blue-600/10 text-blue-400 ring-1 ring-inset ring-blue-500/20"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                )}
              >
                <Icon className={cn(
                  "w-5 h-5 transition-transform duration-200",
                  isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"
                )}/>
                <span className="font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/50 space-y-4">
          <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/30">
            <div className="flex items-center gap-2 mb-2">
              <Github className="w-4 h-4 text-slate-400"/>
              <span className="text-xs font-semibold text-slate-300">OpenCode Connection</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
              <span className="text-[11px] text-emerald-400 font-medium">Headless Link Active</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-2">
            <button className="text-slate-500 hover:text-slate-300 transition-colors">
              <Settings className="w-5 h-5"/>
            </button>
            <div className="flex items-center gap-2 text-slate-500 text-[11px] font-mono">
              <Database className="w-3.5 h-3.5"/>
              SQLite
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="pl-64 min-h-screen flex flex-col">
        <header
          className="h-16 border-b border-slate-800/30 bg-[#0B0E14]/80 backdrop-blur-md sticky top-0 z-40 flex items-center px-8 justify-between shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <button
              onClick={() => setScreen({id: "projects"})}
              className="hover:text-slate-300 transition-colors"
            >
              Projects
            </button>
            {screen.id === "board" && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-700"/>
                <span className="text-slate-300 font-medium">{screen.projectName}</span>
              </>
            )}
            {screen.id === "diagnostics" && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-700"/>
                <span className="text-slate-300 font-medium">Diagnostics</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-amber-500"/>
              <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Dev Mode</span>
            </div>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-hidden flex flex-col">
          {screen.id === "projects" && (
            <ProjectsScreen onProjectSelect={(id, name) => setScreen({id: "board", projectId: id, projectName: name})}/>
          )}
          {screen.id === "diagnostics" && <DiagnosticsScreen/>}
          {screen.id === "board" && (
            <BoardScreen projectId={screen.projectId}/>
          )}
        </div>
      </main>
    </div>
  )
}
