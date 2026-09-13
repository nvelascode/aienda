// api/ai-check.js
// Revisa si la cuenta actual tiene permiso para usar la IA, sin llamar a OpenAI
// (para que activar/probar el interruptor en Configuración no cueste nada).
// La lista de correos permitidos vive en la tabla ai_allowed_users de Supabase,
// no aquí — así se administra desde una sola tabla, sin tocar código.

const SUPABASE_URL = 'https://hymclqcdpplamdinfrhb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-PXExRRGp6CTYxgGd5ftBA_aIHY_04D';

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

    const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
    if (!SECRET_KEY) { res.status(200).json({ allowed: false }); return; }

    const checkRes = await fetch(
      SUPABASE_URL + '/rest/v1/ai_allowed_users?email=eq.' + encodeURIComponent(email) + '&select=email',
      { headers: { apikey: SECRET_KEY, Authorization: 'Bearer ' + SECRET_KEY } }
    );
    if (!checkRes.ok) { res.status(200).json({ allowed: false }); return; }
    const rows = await checkRes.json();
    res.status(200).json({ allowed: Array.isArray(rows) && rows.length > 0 });
  } catch (err) {
    res.status(200).json({ allowed: false });
  }
};
