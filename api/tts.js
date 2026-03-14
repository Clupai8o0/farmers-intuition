export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ELEVEN_LABS
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVEN_LABS API key not configured' })
  }

  const { text, voiceId = 'DXFkLCBUTmvXpp2QwZjA' } = req.body

  if (!text) {
    return res.status(400).json({ error: 'text is required' })
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return res.status(response.status).json({ error: errorText })
    }

    const arrayBuffer = await response.arrayBuffer()
    res.setHeader('Content-Type', 'audio/mpeg')
    res.send(Buffer.from(arrayBuffer))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
