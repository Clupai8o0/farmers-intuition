import { useState, useCallback, useRef, useEffect } from 'react'
import './App.css'

function App() {
  const [state, setState] = useState('idle') // idle | listening | speaking
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef(null)
  const synthRef = useRef(window.speechSynthesis)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
      synthRef.current.cancel()
    }
  }, [])

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
        // Simulate a response after listening ends
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
      setState('idle')
      setTranscript('')
    }
  }, [state, startListening, stopListening])

  const getStatusText = () => {
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

      {/* Bottom controls */}
      <div className="controls">
        {/* End call button */}
        <button
          className="control-btn"
          onClick={() => {
            synthRef.current.cancel()
            if (recognitionRef.current) recognitionRef.current.abort()
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
