import { useState, useEffect } from 'react'
import { Plus, Folder, Trash2, Calendar, HardDrive, Search, MoreVertical } from 'lucide-react'
import type { Project } from '../../shared/types/ipc'

export function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const all = await window.api.project.getAll()
      setProjects(all)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async (name: string, path: string) => {
    try {
      await window.api.project.create({ name, path })
      setShowCreateModal(false)
      loadProjects()
    } catch (error) {
      console.error('Failed to create project:', error)
    }
  }

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return
    try {
      await window.api.project.delete({ id })
      loadProjects()
    } catch (error) {
      console.error('Failed to delete project:', error)
    }
  }

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.path.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-pulse">
        <div className="w-12 h-12 bg-slate-800 rounded-full border-t-2 border-blue-500 mb-4 animate-spin" />
        <span className="text-slate-500 font-medium">Syncing projects...</span>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Project Workspace</h2>
          <p className="text-slate-500 text-sm">Manage and automate your development tasks</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-blue-400 transition-colors" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#11151C] border border-slate-800 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 rounded-xl pl-10 pr-4 py-2 text-sm w-64 transition-all outline-none"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl flex items-center gap-2 font-semibold text-sm transition-all shadow-lg shadow-blue-600/10 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="bg-[#11151C] border border-slate-800/50 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-700/50">
            <Folder className="w-8 h-8 text-slate-600" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {searchQuery ? 'No matching projects found' : 'Workspace is empty'}
          </h3>
          <p className="text-slate-500 text-sm max-w-xs mx-auto mb-8">
            {searchQuery
              ? `We couldn't find any projects matching "${searchQuery}"`
              : 'Connect your first project repository to start automating with AI.'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-sm transition-all border border-slate-700/50"
            >
              Get Started
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="group relative bg-[#11151C] border border-slate-800/50 rounded-2xl p-6 hover:border-blue-500/30 transition-all hover:shadow-xl hover:shadow-blue-500/5"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700/50 group-hover:bg-blue-600/10 group-hover:border-blue-500/30 transition-colors">
                  <Folder className="w-5 h-5 text-slate-400 group-hover:text-blue-400" />
                </div>
                <button className="p-1 text-slate-600 hover:text-slate-300">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>

              <h3 className="text-lg font-bold text-white mb-1 truncate">{project.name}</h3>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-6">
                <HardDrive className="w-3.5 h-3.5" />
                <span className="truncate max-w-[200px]">{project.path}</span>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800/50">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <Calendar className="w-3 h-3" />
                  {new Date(project.updatedAt).toLocaleDateString()}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteProject(project.id)
                  }}
                  className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateProject}
        />
      )}
    </div>
  )
}

function CreateProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (n: string, p: string) => void
}) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-[#11151C] border border-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
        <h2 className="text-2xl font-bold text-white mb-2">Connect Repository</h2>
        <p className="text-slate-500 text-sm mb-8">Link a local folder to start managing tasks</p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onCreate(name, path)
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
