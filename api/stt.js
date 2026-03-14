export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ELEVEN_LABS
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVEN_LABS API key not configured' })
  }

  try {
    // Collect raw body
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)

    // Parse multipart boundary from content-type
    const contentType = req.headers['content-type'] || ''

    // Forward the audio to ElevenLabs STT API
    const response = await fetch(
      'https://api.elevenlabs.io/v1/speech-to-text',
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': contentType,
        },
        body,
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return res.status(response.status).json({ error: errorText })
    }

    const result = await response.json()
    return res.status(200).json(result)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
