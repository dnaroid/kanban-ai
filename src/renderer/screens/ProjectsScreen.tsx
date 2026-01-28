import { useState, useEffect } from 'react'
import { Plus, FolderKanban, Github, ChevronRight } from 'lucide-react'
import type { Project } from '../../shared/types/ipc'

interface ProjectsScreenProps {
  onProjectSelect: (id: string, name: string) => void
}

function CreateProjectModal({
  isOpen,
  onClose,
  onCreate,
}: {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string, path: string) => void
}) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-[#11151C] border border-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
        <h2 className="text-2xl font-bold text-white mb-2">Connect Repository</h2>
        <p className="text-slate-500 text-sm mb-8">Link a local folder to start managing tasks</p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onCreate(name, path)
            setName('')
            setPath('')
          }}
          className="space-y-6"
        >
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">
              Display Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
              placeholder="e.g. My Website"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">
              Absolute Path
            </label>
            <input
              type="text"
              required
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all font-mono text-sm"
              placeholder="/Users/name/projects/my-site"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-sm transition-all border border-slate-700/50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !path.trim()}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
            >
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function ProjectsScreen({ onProjectSelect }: ProjectsScreenProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setLoading(true)
      const data = await window.api.project.getAll()
      setProjects(data)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async (name: string, path: string) => {
    try {
      await window.api.project.create({ name, path })
      setIsModalOpen(false)
      loadProjects()
    } catch (error) {
      console.error('Failed to create project:', error)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Projects</h2>
          <p className="text-slate-500 mt-1">Manage and monitor your AI-driven workspaces</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          New Project
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-slate-800/20 rounded-2xl border border-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-slate-800/10 rounded-3xl border border-dashed border-slate-800/50">
          <div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-4">
            <FolderKanban className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-white">Workspace is empty</h3>
          <p className="text-slate-500 mt-2 max-w-sm text-center">
            Connect your first repository to start managing tasks with Kanban AI
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-6 text-blue-400 font-semibold hover:text-blue-300 transition-colors flex items-center gap-2"
          >
            Get Started <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => onProjectSelect(project.id, project.name)}
              className="group bg-[#11151C] border border-slate-800/50 p-6 rounded-2xl hover:border-blue-500/50 hover:bg-slate-800/20 transition-all text-left relative overflow-hidden active:scale-[0.98]"
            >
              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="w-5 h-5 text-blue-500" />
              </div>
              <div className="w-12 h-12 bg-blue-600/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <FolderKanban className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                {project.name}
              </h3>
              <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
                <Github className="w-4 h-4" />
                <span className="truncate max-w-[200px]">{project.path}</span>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-800/50 flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-600">
                <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
                <span className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                   Active
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateProject}
      />
    </div>
  )
}
