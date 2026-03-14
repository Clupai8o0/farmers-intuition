import { useState, useCallback, useRef, useEffect } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function App() {
  const [state, setState] = useState('idle') // idle | listening | speaking
  const [transcript, setTranscript] = useState('')
  const [ttsLoading, setTtsLoading] = useState(false)
  const [sttLoading, setSttLoading] = useState(false)
  const [sttRecording, setSttRecording] = useState(false)
  const [chatResponse, setChatResponse] = useState('')
  const recognitionRef = useRef(null)
  const synthRef = useRef(window.speechSynthesis)
  const audioRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const lastAlertRef = useRef('')
  const pollTimerRef = useRef(null)

  // Send text to ElevenLabs TTS and play it
  const speakViaTTS = useCallback(async (text) => {
    try {
      setState('speaking')
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        setState('idle')
        URL.revokeObjectURL(url)
      }
      audio.play()
    } catch {
      setState('idle')
    }
  }, [])

  // Send transcript to /chat backend and speak the response
  const sendToChat = useCallback(async (message) => {
    try {
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
    }
  }, [speakViaTTS])

  // Poll /environment every 5s for auto-alerts
  useEffect(() => {
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/environment`)
        const data = await res.json()
        if (data.status === 'ok' && data.should_alert) {
          const alertKey = JSON.stringify(data.alerts || [])
          if (alertKey !== lastAlertRef.current) {
            lastAlertRef.current = alertKey
            const chatRes = await fetch(`${API_BASE}/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: null }),
            })
            const chatData = await chatRes.json()
            if (chatData.response) {
              setChatResponse(chatData.response)
              speakViaTTS(chatData.response)
            }
          }
        }
      } catch {
        /* backend may not be running */
      }
    }, 5000)
    return () => clearInterval(pollTimerRef.current)
  }, [speakViaTTS])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
      synthRef.current.cancel()
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  // --- ElevenLabs TTS ---
  const testTTS = useCallback(async () => {
    setTtsLoading(true)
    setTranscript('')
    setState('speaking')
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello! I am your voice assistant powered by Eleven Labs. How can I help you today?',
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'TTS request failed')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      setTranscript('Playing ElevenLabs TTS audio...')
      audio.onended = () => {
        setState('idle')
        setTranscript('TTS test complete!')
        URL.revokeObjectURL(url)
        setTimeout(() => setTranscript(''), 3000)
      }
      audio.play()
    } catch (err) {
      setTranscript(`TTS Error: ${err.message}`)
      setState('idle')
    } finally {
      setTtsLoading(false)
    }
  }, [])

  // --- ElevenLabs STT ---
  const testSTT = useCallback(async () => {
    if (sttRecording) {
      // Stop recording
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop()
      }
      return
    }

    setSttRecording(true)
    setState('listening')
    setTranscript('Recording... tap again to stop')
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        setSttRecording(false)
        setSttLoading(true)
        setTranscript('Transcribing with ElevenLabs...')
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
          // Send transcript to /chat backend for AI response
          sendToChat(text)
        } catch (err) {
          setTranscript(`STT Error: ${err.message}`)
          setState('idle')
        } finally {
          setSttLoading(false)
        }
      }

      mediaRecorder.start()
    } catch (err) {
      setTranscript(`Mic Error: ${err.message}`)
      setState('idle')
      setSttRecording(false)
    }
  }, [sttRecording, sendToChat])

  // --- Browser-based voice flow (original) ---
  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setTranscript('Speech recognition is not supported in this browser.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    recognition.onstart = () => {
      setState('listening')
      setTranscript('')
    }

    recognition.onresult = (event) => {
      const result = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join('')
      setTranscript(result)
    }

    recognition.onend = () => {
      if (state === 'listening') {
        setState('speaking')
        const responses = [
          "I heard you. How can I help further?",
          "That's interesting. Tell me more.",
          "I understand. What would you like me to do?",
          "Got it. Is there anything else?",
          "I'm here to help. What's next?",
        ]
        const response = responses[Math.floor(Math.random() * responses.length)]
        setTranscript(response)

        const utterance = new SpeechSynthesisUtterance(response)
        utterance.rate = 1
        utterance.pitch = 1
        utterance.onend = () => {
          setState('idle')
          setTranscript('')
        }
        synthRef.current.speak(utterance)
      }
    }

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        setTranscript(`Error: ${event.error}`)
      }
      setState('idle')
    }

    recognition.start()
  }, [state])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }, [])

  const handleMicToggle = useCallback(() => {
    if (state === 'listening') {
      stopListening()
    } else if (state === 'idle') {
      startListening()
    } else if (state === 'speaking') {
      synthRef.current.cancel()
      if (audioRef.current) audioRef.current.pause()
      setState('idle')
      setTranscript('')
    }
  }, [state, startListening, stopListening])

  const handleOrbClick = useCallback(() => {
    if (state === 'idle') {
      startListening()
    } else if (state === 'listening') {
      stopListening()
    } else if (state === 'speaking') {
      synthRef.current.cancel()
      if (audioRef.current) audioRef.current.pause()
      setState('idle')
      setTranscript('')
    }
  }, [state, startListening, stopListening])

  const getStatusText = () => {
    if (ttsLoading) return 'Generating speech...'
    if (sttLoading) return 'Transcribing...'
    if (sttRecording) return 'Recording...'
    switch (state) {
      case 'listening': return 'Listening...'
      case 'speaking': return 'Speaking...'
      default: return 'Tap to start'
    }
  }

  return (
    <div className="voice-assistant">
      {/* Ambient background */}
      <div className="ambient">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ambient-dot" />
        ))}
      </div>

      {/* Main orb */}
      <div
        className={`orb-container ${state}`}
        onClick={handleOrbClick}
        role="button"
        tabIndex={0}
        aria-label={state === 'idle' ? 'Start voice assistant' : 'Stop voice assistant'}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOrbClick() }}
      >
        <div className="orb-ring" />
        <div className="orb-ring" />
        <div className="orb" />

        {/* Audio visualizer bars */}
        <div className="visualizer">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="visualizer-bar" />
          ))}
        </div>
      </div>

      {/* Status */}
      <p className={`status-text ${state !== 'idle' ? 'active' : ''}`}>
        {getStatusText()}
      </p>

      {/* Transcript */}
      <p className="transcript">{transcript}</p>

      {/* Chat response from backend */}
      {chatResponse && (
        <p className="transcript" style={{ opacity: 0.6, marginTop: '0.5rem', fontSize: '0.8rem' }}>
          AI: {chatResponse}
        </p>
      )}

      {/* ElevenLabs test buttons */}
      <div className="test-buttons">
        <button
          className="test-btn tts-btn"
          onClick={testTTS}
          disabled={ttsLoading || state === 'speaking'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
          {ttsLoading ? 'Generating...' : 'Test TTS'}
        </button>

        <button
          className={`test-btn stt-btn ${sttRecording ? 'recording' : ''}`}
          onClick={testSTT}
          disabled={sttLoading}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          {sttLoading ? 'Transcribing...' : sttRecording ? 'Stop Recording' : 'Test STT'}
        </button>
      </div>

      {/* Bottom controls */}
      <div className="controls">
        {/* End call button */}
        <button
          className="control-btn"
          onClick={() => {
            synthRef.current.cancel()
            if (audioRef.current) audioRef.current.pause()
            if (recognitionRef.current) recognitionRef.current.abort()
            if (mediaRecorderRef.current && sttRecording) mediaRecorderRef.current.stop()
            setState('idle')
            setTranscript('')
          }}
          aria-label="End conversation"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Mic button */}
        <button
          className={`control-btn mic-btn ${state === 'listening' ? 'active' : ''}`}
          onClick={handleMicToggle}
          aria-label={state === 'listening' ? 'Stop listening' : 'Start listening'}
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

        {/* Settings button */}
        <button className="control-btn" aria-label="Settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default App
