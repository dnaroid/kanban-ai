import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, User } from 'lucide-react'
import { MessagePartRenderer } from '../../chat/MessageParts'
import { cn } from '../../../lib/utils'
import type { KanbanTask } from '@/shared/types/ipc.ts'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface TaskDrawerChatProps {
  task: KanbanTask
}

export function TaskDrawerChat({ task }: TaskDrawerChatProps) {
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hello! I can help you with task "${task.title}". Ask me anything about its status, history, or code context.`,
    },
  ])
  const [isSending, setIsSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isSending) return

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
    }

    setMessages((prev) => [...prev, userMsg])
    setChatInput('')
    setIsSending(true)

    try {
      setTimeout(() => {
        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            "I've noted that. Is there anything else you need help with regarding this task?",
        }
        setMessages((prev) => [...prev, aiMsg])
        setIsSending(false)
      }, 1000)
    } catch (error) {
      console.error('Failed to send message:', error)
      setIsSending(false)
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const formatTime = (date: number) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full bg-[#0B0E14]">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-4 max-w-[90%]',
              msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg',
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-blue-600 to-indigo-600 shadow-blue-500/20'
                  : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20'
              )}
            >
              {msg.role === 'user' ? (
                <User className="w-4 h-4 text-white" />
              ) : (
                <Sparkles className="w-4 h-4 text-white" />
              )}
            </div>
            <div
              className={cn(
                'flex flex-col min-w-0',
                msg.role === 'user' ? 'items-end' : 'items-start'
              )}
            >
              <div
                className={cn(
                  'px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-md border',
                  msg.role === 'user'
                    ? 'bg-slate-800 text-slate-100 border-slate-700/50 rounded-tr-sm'
                    : 'bg-[#161B26] text-slate-300 border-slate-800 rounded-tl-sm'
                )}
              >
                {msg.role === 'assistant' ? (
                  <MessagePartRenderer part={{ type: 'text', text: msg.content }} />
                ) : (
                  msg.content
                )}
              </div>
              <span className="text-[10px] font-medium text-slate-600 mt-2 px-1">
                {formatTime(parseInt(msg.id) || Date.now())}
              </span>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 bg-[#11151C] border-t border-slate-800/50">
        <div className="relative flex items-center gap-2 bg-slate-900/50 p-1.5 rounded-xl border border-slate-800 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all shadow-inner">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Ask AI about this task..."
            className="flex-1 bg-transparent border-none text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none px-3 h-10"
          />
          <button
            onClick={handleSendMessage}
            disabled={!chatInput.trim() || isSending}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-center text-slate-600 mt-3 font-medium">
          AI can analyze task context, code, and logs.
        </p>
      </div>
    </div>
  )
}
