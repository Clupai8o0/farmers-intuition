import { useState, useCallback, useRef, useEffect } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const BAR_COUNT = 5

function App() {
  const [state, setState] = useState('idle') // idle | listening | processing | speaking
  const [statusMessage, setStatusMessage] = useState('')
  const [transcript, setTranscript] = useState('')
  const [chatResponse, setChatResponse] = useState('')
  const synthRef = useRef(window.speechSynthesis)
  const audioRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const chatBusyRef = useRef(false)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)
  const barsRef = useRef(null)
  const audioCtxRef = useRef(null)

  // Animate visualizer bars from analyser data
  const animateBars = useCallback(() => {
    if (!analyserRef.current || !barsRef.current) return
    const analyser = analyserRef.current
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)

    const bars = barsRef.current.children
    const step = Math.floor(data.length / BAR_COUNT)
    for (let i = 0; i < BAR_COUNT; i++) {
      const val = data[i * step] / 255
      const h = 12 + val * 44
      bars[i].style.height = `${h}px`
    }
    animFrameRef.current = requestAnimationFrame(animateBars)
  }, [])

  // Start mic analyser for live waveform
  const startAnalyser = useCallback((stream) => {
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.7
    source.connect(analyser)
    analyserRef.current = analyser
    animateBars()
  }, [animateBars])

  // Start audio element analyser for TTS playback
  const startPlaybackAnalyser = useCallback((audioEl) => {
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    const source = ctx.createMediaElementSource(audioEl)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.7
    source.connect(analyser)
    analyser.connect(ctx.destination)
    analyserRef.current = analyser
    animateBars()
  }, [animateBars])

  const stopAnalyser = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = null
    analyserRef.current = null
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    // Reset bars
    if (barsRef.current) {
      for (const bar of barsRef.current.children) {
        bar.style.height = '12px'
      }
    }
  }, [])

  // Send text to ElevenLabs TTS and play it
  const speakViaTTS = useCallback(async (text) => {
    try {
      setState('processing')
      setStatusMessage('converting to speech...')
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) { setState('idle'); setStatusMessage(''); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.crossOrigin = 'anonymous'
      audioRef.current = audio
      setState('speaking')
      setStatusMessage('speaking...')
      audio.onended = () => {
        setState('idle')
        setStatusMessage('')
        stopAnalyser()
        URL.revokeObjectURL(url)
      }
      audio.play()
      startPlaybackAnalyser(audio)
    } catch {
      setState('idle')
      setStatusMessage('')
      stopAnalyser()
    }
  }, [startPlaybackAnalyser, stopAnalyser])

  // Ensure environment is synced before sending chat
  const syncEnvironment = useCallback(async () => {
    try {
      const envRes = await fetch(`${API_BASE}/environment`)
      const envData = await envRes.json()
      if (envData.status === 'no_data') {
        await fetch(`${API_BASE}/environment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            temperature: 24.0,
            humidity: 45.0,
            soil_moisture: 62.0,
            rainfall: 0.0,
            wind_speed: 8.0,
            growth_stage: 'veraison',
            variety: 'shiraz',
            region: 'yarra_valley',
          }),
        })
      }
    } catch {
      /* backend may not be running */
    }
  }, [])

  // Send transcript to /chat backend and speak the response
  const sendToChat = useCallback(async (message) => {
    if (chatBusyRef.current) return
    chatBusyRef.current = true
    setState('processing')
    setStatusMessage('checking your crop conditions...')
    try {
      await syncEnvironment()
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = await res.json()
      if (data.response) {
        setChatResponse(data.response)
        await speakViaTTS(data.response)
      }
    } catch (err) {
      console.error('Chat call failed:', err)
      setState('idle')
      setStatusMessage('')
    } finally {
      chatBusyRef.current = false
    }
  }, [speakViaTTS, syncEnvironment])

  // Seed default environment data if none exists
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/environment`)
        const data = await res.json()
        if (data.status === 'no_data') {
          await fetch(`${API_BASE}/environment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              temperature: 24.0,
              humidity: 45.0,
              soil_moisture: 62.0,
              rainfall: 0.0,
              wind_speed: 8.0,
              growth_stage: 'veraison',
              variety: 'shiraz',
              region: 'yarra_valley',
            }),
          })
        }
      } catch {
        /* backend may not be running */
      }
    })()
  }, [])

  // Check for pending voice alerts queued by the dashboard
  useEffect(() => {
    const pending = localStorage.getItem('pendingVoiceAlert')
    if (pending) {
      localStorage.removeItem('pendingVoiceAlert')
      setChatResponse(pending)
      speakViaTTS(pending)
    }
  }, [speakViaTTS])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      synthRef.current.cancel()
      if (audioRef.current) audioRef.current.pause()
      stopAnalyser()
    }
  }, [stopAnalyser])

  // Voice flow
  const startListening = useCallback(async () => {
    if (chatBusyRef.current) return
    setState('listening')
    setStatusMessage('listening...')
    setTranscript('')
    setChatResponse('')
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      startAnalyser(stream)

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        setState('processing')
        setStatusMessage('transcribing to words...')
        setTranscript('')
        stopAnalyser()
        stream.getTracks().forEach((t) => t.stop())

        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          const formData = new FormData()
          formData.append('file', blob, 'recording.webm')
          formData.append('model_id', 'scribe_v1')

          const res = await fetch('/api/stt', {
            method: 'POST',
            body: formData,
          })

          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error || 'STT request failed')
          }

          const result = await res.json()
          const text = result.text || JSON.stringify(result)
          setTranscript(`You said: "${text}"`)
          sendToChat(text)
        } catch (err) {
          setTranscript(`Error: ${err.message}`)
          setStatusMessage('')
          setState('idle')
        }
      }

      mediaRecorder.start()
    } catch (err) {
      setTranscript(`Mic Error: ${err.message}`)
      setStatusMessage('')
      setState('idle')
    }
  }, [sendToChat, startAnalyser, stopAnalyser])

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const handleBubbleClick = useCallback(() => {
    if (state === 'processing') return
    if (state === 'idle') {
      startListening()
    } else if (state === 'listening') {
      stopListening()
    } else if (state === 'speaking') {
      if (audioRef.current) audioRef.current.pause()
      stopAnalyser()
      setState('idle')
      setStatusMessage('')
      setTranscript('')
    }
  }, [state, startListening, stopListening, stopAnalyser])

  return (
    <div className="voice-assistant">
      {/* Sound wave visualizer */}
      <div className={`wave-container ${state}`} ref={barsRef}>
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <div key={i} className="wave-bar" />
        ))}
      </div>

      {/* Mic bubble */}
      <button
        className={`mic-bubble ${state}`}
        onClick={handleBubbleClick}
        aria-label={state === 'idle' ? 'Start voice assistant' : 'Stop voice assistant'}
      >
        {state === 'listening' ? (
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>

      {/* Status label */}
      <p className="status-label">{statusMessage || 'push to speak'}</p>

      {/* Transcript / response */}
      {transcript && <p className="transcript">{transcript}</p>}
      {chatResponse && <p className="chat-response">{chatResponse}</p>}
    </div>
  )
}

export default App
