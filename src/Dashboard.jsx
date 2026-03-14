import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './Dashboard.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''

const VARIETIES = [
  { value: 'shiraz', label: 'Shiraz' },
  { value: 'cabernet_sauvignon', label: 'Cabernet Sauvignon' },
  { value: 'pinot_noir', label: 'Pinot Noir' },
  { value: 'chardonnay', label: 'Chardonnay' },
  { value: 'merlot', label: 'Merlot' },
]

const GROWTH_STAGES = [
  { value: 'budburst', label: 'Budburst' },
  { value: 'flowering', label: 'Flowering' },
  { value: 'veraison', label: 'Veraison' },
  { value: 'harvest', label: 'Harvest' },
  { value: 'dormancy', label: 'Dormancy' },
]

const REGIONS = [
  { value: 'yarra_valley', label: 'Yarra Valley' },
  { value: 'mornington_peninsula', label: 'Mornington Peninsula' },
  { value: 'gippsland', label: 'Gippsland' },
  { value: 'heathcote', label: 'Heathcote' },
  { value: 'macedon_ranges', label: 'Macedon Ranges' },
]

function CircularGauge({ label, value, min, max, unit, color, onChange }) {
  const radius = 54
  const strokeWidth = 8
  const r = radius - strokeWidth / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const offset = circumference * (1 - pct)

  return (
    <div className="gauge-container">
      <div className="gauge-ring">
        <svg width={radius * 2} height={radius * 2}>
          <circle
            cx={radius} cy={radius} r={r}
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth}
          />
          <circle
            cx={radius} cy={radius} r={r}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="gauge-arc"
          />
        </svg>
        <div className="gauge-center">
          <span className="gauge-number">{value.toFixed(1)}</span>
          <span className="gauge-unit">{unit}</span>
        </div>
      </div>
      <div className="gauge-label">{label}</div>
      <input
        type="range" min={min} max={max} step={(max - min) / 200}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="gauge-slider"
        style={{ '--slider-color': color }}
      />
    </div>
  )
}

export default function Dashboard() {
  const [temperature, setTemperature] = useState(24.0)
  const [humidity, setHumidity] = useState(45.0)
  const [soilMoisture, setSoilMoisture] = useState(62.0)
  const [rainfall, setRainfall] = useState(0.0)
  const [windSpeed, setWindSpeed] = useState(8.0)
  const [farmSize, setFarmSize] = useState(5.0)
  const [variety, setVariety] = useState('shiraz')
  const [growthStage, setGrowthStage] = useState('veraison')
  const [region, setRegion] = useState('yarra_valley')

  const [backendStatus, setBackendStatus] = useState('checking')
  const [syncing, setSyncing] = useState(false)
  const [recommendation, setRecommendation] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [lastChatResponse, setLastChatResponse] = useState('')

  const pushTimerRef = useRef(null)
  const initialLoadRef = useRef(true)
  const audioRef = useRef(new Audio())

  // Health check on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/health`)
        const data = await res.json()
        if (cancelled) return
        if (data.status === 'ok') {
          setBackendStatus('online')
          try {
            const envRes = await fetch(`${API_BASE}/environment`)
            const envData = await envRes.json()
            if (cancelled) return
            if (envData.status === 'ok' && envData.environment) {
              const env = envData.environment
              if (env.temperature != null) setTemperature(env.temperature)
              if (env.humidity != null) setHumidity(env.humidity)
              if (env.soil_moisture != null) setSoilMoisture(env.soil_moisture)
              if (env.rainfall != null) setRainfall(env.rainfall)
              if (env.wind_speed != null) setWindSpeed(env.wind_speed)
              if (env.land_area_ha != null) setFarmSize(env.land_area_ha)
              if (env.variety) setVariety(env.variety)
              if (env.growth_stage) setGrowthStage(env.growth_stage)
              if (env.region) setRegion(env.region)
            }
          } catch {
            /* no previous state */
          }
        } else {
          setBackendStatus('offline')
        }
      } catch {
        if (!cancelled) setBackendStatus('offline')
      }
      if (!cancelled) initialLoadRef.current = false
    })()
    return () => { cancelled = true }
  }, [])

  // Auto-alert: call /chat, show text, queue for voice mode (no TTS on dashboard)
  const triggerAutoAlert = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: null }),
      })
      const data = await res.json()
      if (data.response) {
        setLastChatResponse(data.response)
        // Queue alert for voice assistant page to speak when user switches
        localStorage.setItem('pendingVoiceAlert', data.response)
      }
    } catch (err) {
      console.error('Auto-alert chat failed:', err)
    }
  }, [])

  // Debounced environment push on gauge change
  useEffect(() => {
    if (initialLoadRef.current || backendStatus !== 'online') return

    clearTimeout(pushTimerRef.current)
    pushTimerRef.current = setTimeout(async () => {
      setSyncing(true)
      try {
        const res = await fetch(`${API_BASE}/environment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            temperature,
            humidity,
            soil_moisture: soilMoisture,
            rainfall,
            wind_speed: windSpeed,
            land_area_ha: farmSize,
            growth_stage: growthStage,
            variety,
            region,
          }),
        })
        const data = await res.json()
        if (data.recommendation) setRecommendation(data.recommendation)
        if (data.alerts) setAlerts(data.alerts)
        if (data.should_alert) {
          triggerAutoAlert()
        } else {
          localStorage.removeItem('pendingVoiceAlert')
        }
      } catch (err) {
        console.error('Failed to push environment:', err)
      } finally {
        setSyncing(false)
      }
    }, 500)

    return () => clearTimeout(pushTimerRef.current)
  }, [temperature, humidity, soilMoisture, rainfall, windSpeed, farmSize, variety, growthStage, region, backendStatus, triggerAutoAlert])

  const savings = useMemo(() => {
    if (!recommendation) return null
    const BASELINE_L_HA_DAY = 4500
    const COST_PER_KL = 3.50
    const baselineWeeklyL = BASELINE_L_HA_DAY * 7 * farmSize
    const modelWeeklyL = recommendation.recommended_weekly_l ?? 0
    const reductionPct = baselineWeeklyL > 0
      ? Math.max(0, ((baselineWeeklyL - modelWeeklyL) / baselineWeeklyL) * 100)
      : 0
    const annualSavedL = Math.max(0, (baselineWeeklyL - modelWeeklyL) * 52)
    const annualSavedKL = annualSavedL / 1000
    const annualSavedAUD = annualSavedKL * COST_PER_KL
    return { reductionPct, annualSavedAUD, annualSavedKL }
  }, [recommendation, farmSize])

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Farmer&apos;s Intuition</h1>
        <div className={`backend-status ${backendStatus}`}>
          <span className="status-dot" />
          {backendStatus === 'checking' && 'Connecting...'}
          {backendStatus === 'online' && 'Backend connected'}
          {backendStatus === 'offline' && 'Backend offline'}
        </div>
        {syncing && (
          <div className="sync-indicator">
            <span className="sync-spinner" />
            Syncing sensor data...
          </div>
        )}
      </header>

      <section className="selectors-row">
        <div className="selector-group">
          <label className="selector-label">Variety</label>
          <select className="selector" value={variety} onChange={(e) => setVariety(e.target.value)}>
            {VARIETIES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
        <div className="selector-group">
          <label className="selector-label">Growth Stage</label>
          <select className="selector" value={growthStage} onChange={(e) => setGrowthStage(e.target.value)}>
            {GROWTH_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="selector-group">
          <label className="selector-label">Region</label>
          <select className="selector" value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </section>

      <section className="gauges-row">
        <CircularGauge label="Temperature" value={temperature} min={0} max={50} unit="°C" color="#f97316" onChange={setTemperature} />
        <CircularGauge label="Humidity" value={humidity} min={0} max={100} unit="%" color="#3b82f6" onChange={setHumidity} />
        <CircularGauge label="Soil Moisture" value={soilMoisture} min={0} max={100} unit="%" color="#22c55e" onChange={setSoilMoisture} />
        <CircularGauge label="Rainfall" value={rainfall} min={0} max={100} unit="mm" color="#8b5cf6" onChange={setRainfall} />
        <CircularGauge label="Wind Speed" value={windSpeed} min={0} max={150} unit="km/h" color="#06b6d4" onChange={setWindSpeed} />
        <CircularGauge label="Farm Size" value={farmSize} min={0.5} max={50} unit="ha" color="#a3e635" onChange={setFarmSize} />
      </section>

      <section className="info-panel">
        {recommendation && (
          <div className="card recommendation-card">
            <h2>Irrigation Recommendation</h2>
            <div className="rec-grid">
              <div className="rec-item">
                <span className="rec-value">{recommendation.recommended_daily_l?.toFixed(0) ?? '\u2014'}</span>
                <span className="rec-label">Daily Water (L)</span>
              </div>
              <div className="rec-item">
                <span className="rec-value">{recommendation.recommended_weekly_l?.toFixed(0) ?? '\u2014'}</span>
                <span className="rec-label">Weekly Water (L)</span>
              </div>
              <div className="rec-item">
                <span className={`rec-value confidence-${recommendation.confidence_level}`}>
                  {recommendation.confidence_level ?? '\u2014'}
                </span>
                <span className="rec-label">Confidence</span>
              </div>
            </div>
          </div>
        )}

        {savings && (
          <div className="card savings-card">
            <h2>Estimated Savings</h2>
            <div className="rec-grid">
              <div className="rec-item">
                <span className={`rec-value ${savings.reductionPct > 0 ? 'savings-positive' : ''}`}>
                  {savings.reductionPct > 0 ? '\u2193 ' : ''}{savings.reductionPct.toFixed(0)}%
                </span>
                <span className="rec-label">Water Reduction</span>
              </div>
              <div className="rec-item">
                <span className={`rec-value ${savings.annualSavedAUD > 0 ? 'savings-positive' : ''}`}>
                  ${savings.annualSavedAUD.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
                </span>
                <span className="rec-label">Saved / Year (AUD)</span>
              </div>
              <div className="rec-item">
                <span className={`rec-value ${savings.annualSavedKL > 0 ? 'savings-positive' : ''}`}>
                  {savings.annualSavedKL.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
                </span>
                <span className="rec-label">kL Conserved / Year</span>
              </div>
            </div>
            <p className="savings-disclaimer">
              Estimate based on {farmSize.toFixed(1)} ha vineyard, $3.50/kL rural water rate, vs fixed 4,500 L/ha/day schedule
            </p>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="card alerts-card">
            <h2>Active Alerts</h2>
            <ul>
              {alerts.map((alert, i) => (
                <li key={i}>{alert}</li>
              ))}
            </ul>
          </div>
        )}

        {lastChatResponse && (
          <div className="card chat-response-card">
            <h2>Last AI Response</h2>
            <p>{lastChatResponse}</p>
          </div>
        )}

        {!recommendation && backendStatus === 'online' && (
          <div className="card placeholder-card">
            <p>Adjust the gauges above to get irrigation recommendations</p>
          </div>
        )}

        {backendStatus === 'offline' && (
          <div className="card offline-card">
            <p>Backend is offline. Start the server with: <code>uvicorn src.api.main:app --reload</code></p>
          </div>
        )}
      </section>
    </div>
  )
}
