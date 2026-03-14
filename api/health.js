export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const hasElevenLabsKey = !!process.env.ELEVEN_LABS

  res.status(200).json({
    status: 'ok',
    services: {
      elevenlabs: hasElevenLabsKey ? 'configured' : 'missing_api_key',
      tts: hasElevenLabsKey ? 'available' : 'unavailable',
      stt: hasElevenLabsKey ? 'available' : 'unavailable',
    },
    timestamp: new Date().toISOString(),
  })
}
