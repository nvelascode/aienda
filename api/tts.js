// api/tts.js
// Genera audio con la voz de OpenAI, SOLO como respaldo cuando la voz del
// navegador (speechSynthesis) falla. Usa el mismo control de acceso que ai-assist.js.

const SUPABASE_URL = 'https://hymclqcdpplamdinfrhb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-PXExRRGp6CTYxgGd5ftBA_aIHY_04D';

async function tieneAcceso(email) {
  const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  if (!SECRET_KEY) return false;
  const checkRes = await fetch(
    SUPABASE_URL + '/rest/v1/ai_allowed_users?email=eq.' + encodeURIComponent(email) + '&select=email',
    { headers: { apikey: SECRET_KEY, Authorization: 'Bearer ' + SECRET_KEY } }
  );
  if (!checkRes.ok) return false;
  const rows = await checkRes.json();
  return Array.isArray(rows) && rows.length > 0;
}

module.exports = async (req, res) => {
  try {
    const { token, texto } = req.body || {};
    if (!token || !texto) { res.status(400).json({ error: 'faltan_datos' }); return; }

    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) { res.status(401).json({ error: 'no_autorizado' }); return; }
    const user = await userRes.json();
    const email = (user.email || '').toLowerCase();

    if (!(await tieneAcceso(email))) { res.status(403).json({ error: 'sin_acceso' }); return; }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) { res.status(500).json({ error: 'falta_openai_key' }); return; }

    // Límite de seguridad: evita que una respuesta muy larga dispare un costo inesperado
    const textoLimitado = String(texto).slice(0, 600);

    const openaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + OPENAI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'nova',
        input: textoLimitado,
        response_format: 'mp3'
      })
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI TTS falló:', errText);
      res.status(502).json({ error: 'tts_fallo' });
      return;
    }

    const buffer = Buffer.from(await openaiRes.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.status(200).send(buffer);
  } catch (err) {
    console.error('Error en tts.js', err);
    res.status(500).json({ error: 'error_interno' });
  }
};
