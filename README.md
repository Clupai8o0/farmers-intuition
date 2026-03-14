# Farmers Intuition

A voice-powered farming assistant built with React, ElevenLabs AI, and Vercel serverless functions. The app provides speech-to-text and text-to-speech capabilities for hands-free interaction with agricultural insights.

## Tech Stack

- **Frontend**: React 19 + Vite 8
- **Voice AI**: ElevenLabs (TTS & STT)
- **Deployment**: Vercel (serverless API routes)
- **Fallback**: Web Speech API (browser-native)

## Getting Started

```bash
npm install
npm run dev
```

Set the `ELEVEN_LABS` environment variable with your ElevenLabs API key (in Vercel dashboard or a local `.env` file).

## API Endpoints

Base URL:
- **Local**: `http://localhost:5173` (Vite dev server)
- **Production**: Your Vercel deployment URL

---

### GET `/api/health`

Check if the backend services are configured and ready.

**Request:**
```js
const res = await fetch(`${API_BASE}/api/health`);
const data = await res.json();
```

**Response:**
```json
{
  "status": "ok",
  "services": {
    "elevenlabs": "configured",
    "tts": "available",
    "stt": "available"
  },
  "timestamp": "2026-03-14T10:00:00.000Z"
}
```

If the `ELEVEN_LABS` API key is not set, services will report `"missing_api_key"` / `"unavailable"`.

**Use:** Call on dashboard load to verify the backend is reachable before enabling voice controls.

```js
const checkHealth = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();
    if (data.services.tts === 'available') {
      enableVoiceControls();
    }
  } catch {
    showOfflineBanner();
  }
};
```

---

### POST `/api/tts`

Convert text to speech using ElevenLabs.

**Request:**
```js
const res = await fetch(`${API_BASE}/api/tts`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Hello, farmer!',         // required
    voiceId: 'DXFkLCBUTmvXpp2QwZjA' // optional, default voice
  })
});
```

**Response:** Binary audio data (`audio/mpeg`).

**Use:** Play the returned audio blob directly:
```js
const blob = await res.blob();
const url = URL.createObjectURL(blob);
const audio = new Audio(url);
audio.play();
```

---

### POST `/api/stt`

Convert speech to text using ElevenLabs Scribe.

**Request:**
```js
const formData = new FormData();
formData.append('file', audioBlob, 'recording.webm');
formData.append('model_id', 'scribe_v1');

const res = await fetch(`${API_BASE}/api/stt`, {
  method: 'POST',
  body: formData
});
const data = await res.json();
```

**Response:**
```json
{
  "text": "Should I irrigate today?"
}
```

**Use:** Record audio via `MediaRecorder`, send the blob, and use the transcription as user input.

---

### Backend Integration (External API)

When connected to the Python ML backend, these additional endpoints become available:

#### GET `/health`

Check if the ML backend and model are ready.

```js
const res = await fetch(`${BACKEND_URL}/health`);
const data = await res.json();
// { status: "ok", model_loaded: true, model_path: "..." }
```

#### POST `/environment`

Send sensor values to get irrigation recommendations.

```js
const res = await fetch(`${BACKEND_URL}/environment`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    temperature: 24.0,        // °C, 0-50
    humidity: 45.0,            // %, 0-100
    soil_moisture: 62.0,       // %, 0-100
    rainfall: 0.0,             // mm, 0-100
    wind_speed: 8.0,           // km/h, 0-150
    growth_stage: 'veraison',  // optional, default "veraison"
    variety: 'shiraz',         // optional, default "shiraz"
    region: 'yarra_valley'     // optional, default "yarra_valley"
  })
});
const data = await res.json();
```

**Response:**
```json
{
  "status": "ok",
  "recommendation": {
    "baseline_weekly_l": 12000.5,
    "recommended_weekly_l": 10850.2,
    "recommended_daily_l": 1550.03,
    "confidence_level": "medium",
    "assumptions": ["..."],
    "warnings": ["..."],
    "model_name": "random_forest"
  },
  "should_alert": true,
  "alerts": ["Downy mildew conditions detected — high humidity + warm temp + rainfall"],
  "environment": { "..." }
}
```

**Frontend integration:**
```js
const pushEnvironment = debounce(async () => {
  const state = getGaugeValues();
  const res = await fetch(`${BACKEND_URL}/environment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state)
  });
  const data = await res.json();

  updateWaterDisplay(data.recommendation.recommended_daily_l);

  if (data.should_alert) {
    triggerAutoAlert();
  }
}, 500);
```

#### GET `/environment`

Get the current stored environment state without sending new values.

```js
const res = await fetch(`${BACKEND_URL}/environment`);
const data = await res.json();
// { status: "ok", environment: { temperature: 24, humidity: 45, ... } }
```

#### POST `/chat`

Gemini-powered voice assistant. Supports auto-alerts and farmer questions.

**Auto-alert** (triggered when `should_alert` is true):
```js
const res = await fetch(`${BACKEND_URL}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: null })
});
// { response: "Watch out — humidity's up at 85%...", is_alert: true }
```

**Farmer question** (from STT transcript):
```js
const res = await fetch(`${BACKEND_URL}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Should I irrigate today?' })
});
// { response: "Your soil's at 62% which is spot on...", is_alert: false }
```

#### POST `/predict`

Direct ML model prediction (raw, without recommendation adjustments).

#### POST `/recommend`

Full recommendation with agronomic adjustments.

#### POST `/retrain`

Re-train the ML model. Local use only (requires writable disk).

---

## Integration Flow

```
Dashboard knob change
  → debounce 500ms
  → POST /environment
  → display recommendation numbers
  → if should_alert:
      → POST /chat { message: null }
      → send response to ElevenLabs TTS
      → show alert banner on dashboard

Farmer speaks
  → ElevenLabs STT → transcript
  → POST /chat { message: transcript }
  → send response to ElevenLabs TTS
```

## Development

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # Run ESLint
npm run preview  # Preview production build
```
