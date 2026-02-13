import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Mic, MicOff, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { type STTStatus } from '../../voice/STTWorkerController'
import { VoiceCapture } from '../../voice/VoiceCapture'
import { getSTTController } from '../../voice/sttControllerSingleton'

interface VoiceInputButtonProps {
  onTranscript?: (text: string) => void
  onDelta?: (text: string) => void
  className?: string
  modelPaths: Record<'ru' | 'en', string>
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  onDelta,
  className,
  modelPaths,
}) => {
  const [status, setStatus] = useState<STTStatus>('idle')
  const [language, setLanguage] = useState<'ru' | 'en'>('ru')
  const [error, setError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [liveText, setLiveText] = useState('')
  const isRecordingRef = useRef(false)
  const liveTextRef = useRef('')
  const onDeltaRef = useRef<((text: string) => void) | undefined>(onDelta)
  const onTranscriptRef = useRef<((text: string) => void) | undefined>(onTranscript)

  const sttControllerRef = useRef<ReturnType<typeof getSTTController> | null>(null)
  const voiceCaptureRef = useRef<VoiceCapture | null>(null)

  useEffect(() => {
    onDeltaRef.current = onDelta
    onTranscriptRef.current = onTranscript
    liveTextRef.current = liveText
  }, [onDelta, onTranscript, liveText])

  useEffect(() => {
    const controller = getSTTController(modelPaths)
    sttControllerRef.current = controller

    const handleStatus = (newStatus: STTStatus) => {
      setStatus(newStatus)
      if (newStatus === 'idle' || newStatus === 'error') {
        setIsRecording(false)
        isRecordingRef.current = false
      }
    }

    const handlePartial = (text: string) => {
      setLiveText(text)
      onDeltaRef.current?.(text)
    }

    const handleFinal = (text: string) => {
      onTranscriptRef.current?.(text)
      setLiveText('')
      onDeltaRef.current?.('')
    }

    const handleError = (message: string) => {
      setError(message)
      setStatus('error')
      setIsRecording(false)
      isRecordingRef.current = false
    }

    controller.on('status', handleStatus)
    controller.on('partial', handlePartial)
    controller.on('final', handleFinal)
    controller.on('error', handleError)

    return () => {
      if (voiceCaptureRef.current) {
        voiceCaptureRef.current.dispose()
      }
      controller.off('status', handleStatus)
      controller.off('partial', handlePartial)
      controller.off('final', handleFinal)
      controller.off('error', handleError)
    }
  }, [modelPaths])

  const handleLanguageChange = useCallback(
    async (nextLanguage: 'ru' | 'en') => {
      if (!sttControllerRef.current) return

      setLanguage(nextLanguage)

      if (isRecording) {
        try {
          await sttControllerRef.current.setLanguage(nextLanguage)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to change language')
        }
      }
    },
    [isRecording]
  )

  const handleToggleRecording = useCallback(async () => {
    if (!sttControllerRef.current) return

    if (isRecording) {
      const pendingText = liveTextRef.current.trim()
      if (pendingText) {
        onTranscriptRef.current?.(pendingText)
        setLiveText('')
        onDeltaRef.current?.('')
      }
      voiceCaptureRef.current?.stop()
      sttControllerRef.current.reset()
      setIsRecording(false)
      isRecordingRef.current = false
    } else {
      setError(null)
      try {
        if (!voiceCaptureRef.current) {
          voiceCaptureRef.current = new VoiceCapture(sttControllerRef.current)
        }

        const controller = sttControllerRef.current
        const currentStatus = controller.getStatus()

        if (currentStatus === 'idle') {
          await controller.init(language)
        }

        await voiceCaptureRef.current.start()
        setIsRecording(true)
        isRecordingRef.current = true
      } catch (err) {
        setIsRecording(false)
        isRecordingRef.current = false
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Microphone access denied')
      }
    }
  }, [isRecording, language])

  const getStatusColor = () => {
    switch (status) {
      case 'ready':
        return 'text-blue-400'
      case 'initializing':
        return 'text-slate-300'
      case 'speech':
        return 'text-green-400'
      case 'error':
        return 'text-red-400'
      default:
        return 'text-slate-400'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'ready':
        return 'Ready'
      case 'initializing':
        return 'Initializing...'
      case 'speech':
        return 'Speaking...'
      case 'error':
        return 'Error'
      default:
        return 'Idle'
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex bg-[#161B22] rounded-lg p-1 border border-slate-800 h-8 items-center">
        <button
          onClick={() => handleLanguageChange('ru')}
          className={cn(
            'px-2 h-6 flex items-center justify-center text-[10px] font-bold rounded transition-all',
            language === 'ru' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'
          )}
        >
          RU
        </button>
        <button
          onClick={() => handleLanguageChange('en')}
          className={cn(
            'px-2 h-6 flex items-center justify-center text-[10px] font-bold rounded transition-all',
            language === 'en' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'
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
            'relative w-8 h-8 rounded-full transition-all duration-300 flex items-center justify-center border',
            isRecording
              ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20'
              : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
          )}
          title={`${isRecording ? 'Stop Recording' : 'Start Voice Input'} (${getStatusText()})`}
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
          title={getStatusText()}
        >
          {status === 'initializing' ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          ) : status === 'error' ? (
            <AlertCircle className="w-2.5 h-2.5" />
          ) : null}
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
