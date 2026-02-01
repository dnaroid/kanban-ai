import React, { useState, useEffect, useCallback } from 'react'
import { Mic, MicOff, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { voiceCapture } from '../../voice/VoiceCapture'
import {
  STTLanguage,
  STTStatus,
  STTStartInput,
  STTStopInput,
  STTAudioInput,
  STTStatusEvent,
  STTDeltaEvent,
  STTFinalEvent,
  STTErrorEvent,
} from '@/shared/types/ipc'

interface STTApi {
  start(input: STTStartInput): Promise<void>
  stop(input: STTStopInput): Promise<void>
  sendAudio(input: STTAudioInput): Promise<void>
  onStatus(callback: (event: STTStatusEvent) => void): () => void
  onDelta(callback: (event: STTDeltaEvent) => void): () => void
  onFinal(callback: (event: STTFinalEvent) => void): () => void
  onError(callback: (event: STTErrorEvent) => void): () => void
}

interface VoiceInputButtonProps {
  editorId: string
  onTranscript?: (text: string) => void
  onDelta?: (text: string) => void
  className?: string
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  editorId,
  onTranscript,
  onDelta,
  className,
}) => {
  const [status, setStatus] = useState<STTStatus>('idle')
  const [language, setLanguage] = useState<STTLanguage>('ru')
  const [error, setError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      await voiceCapture.stop()
      setIsRecording(false)
    } else {
      setError(null)
      try {
        await voiceCapture.start(editorId, language)
        setIsRecording(true)
      } catch (err) {
        setIsRecording(false)
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Microphone access denied')
      }
    }
  }, [isRecording, editorId, language])

  useEffect(() => {
    const stt = (window.api as any).stt as STTApi

    const unsubStatus = stt.onStatus((event: STTStatusEvent) => {
      if (event.editorId === editorId) {
        setStatus(event.status)
        if (event.status === 'error') {
          setError(event.details || 'Transcription error')
          setIsRecording(false)
        }
      }
    })

    const unsubDelta = stt.onDelta((event: STTDeltaEvent) => {
      if (event.editorId === editorId) {
        onDelta?.(event.textDelta)
      }
    })

    const unsubFinal = stt.onFinal((event: STTFinalEvent) => {
      if (event.editorId === editorId) {
        onTranscript?.(event.transcript)
      }
    })

    const unsubError = stt.onError((event: STTErrorEvent) => {
      if (event.editorId === editorId) {
        setStatus('error')
        setError(event.error.message)
        setIsRecording(false)
      }
    })

    return () => {
      unsubStatus()
      unsubDelta()
      unsubFinal()
      unsubError()
      if (isRecording) {
        voiceCapture.stop()
      }
    }
  }, [editorId, onDelta, onTranscript, isRecording])

  const getStatusColor = () => {
    switch (status) {
      case 'listening':
        return 'text-blue-400'
      case 'speech':
        return 'text-green-400'
      case 'finalizing':
        return 'text-purple-400'
      case 'error':
        return 'text-red-400'
      default:
        return 'text-slate-400'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'listening':
        return 'Listening...'
      case 'speech':
        return 'Speaking...'
      case 'finalizing':
        return 'Processing...'
      case 'error':
        return 'Error'
      default:
        return 'Idle'
    }
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex bg-[#161B22] rounded-lg p-1 border border-slate-800">
        <button
          onClick={() => setLanguage('ru')}
          disabled={isRecording}
          className={cn(
            'px-2 py-1 text-[10px] font-bold rounded transition-all',
            language === 'ru' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300',
            isRecording && 'opacity-50 cursor-not-allowed'
          )}
        >
          RU
        </button>
        <button
          onClick={() => setLanguage('en')}
          disabled={isRecording}
          className={cn(
            'px-2 py-1 text-[10px] font-bold rounded transition-all',
            language === 'en' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300',
            isRecording && 'opacity-50 cursor-not-allowed'
          )}
        >
          EN
        </button>
      </div>

      <div className="relative">
        {status === 'speech' && (
          <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
        )}
        <button
          onClick={handleToggleRecording}
          className={cn(
            'relative p-2 rounded-full transition-all duration-300 flex items-center justify-center border',
            isRecording
              ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20'
              : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
          )}
          title={isRecording ? 'Stop Recording' : 'Start Voice Input'}
        >
          {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex flex-col">
        <div
          className={cn(
            'text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5',
            getStatusColor()
          )}
        >
          {status === 'listening' || status === 'finalizing' ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          ) : status === 'error' ? (
            <AlertCircle className="w-2.5 h-2.5" />
          ) : null}
          {getStatusText()}
        </div>
        {error && (
          <div className="text-[10px] text-red-400/80 max-w-[200px] truncate" title={error}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
