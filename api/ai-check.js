// api/ai-check.js
// Revisa si la cuenta actual tiene permiso para usar la IA, sin llamar a OpenAI
// (para que activar/probar el interruptor en Configuración no cueste nada).

const SUPABASE_URL = 'https://hymclqcdpplamdinfrhb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-PXExRRGp6CTYxgGd5ftBA_aIHY_04D';

// Debe ser la MISMA lista que en ai-assist.js de este proyecto.
const ALLOWED_EMAILS = ['nvelascop@ismm.edu.co', 'silvitapinzon2015@gmail.com', 'judys_90@hotmail.com'];

module.exports = async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) { res.status(200).json({ allowed: false }); return; }

    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) { res.status(200).json({ allowed: false }); return; }

    const user = await userRes.json();
    const email = (user.email || '').toLowerCase();
    res.status(200).json({ allowed: ALLOWED_EMAILS.includes(email) });
  } catch (err) {
    res.status(200).json({ allowed: false });
  }
};
