// api/send-med-reminders.js
// Revisa SOLO medicamentos, cada 15 minutos, disparado por un cron externo
// (cron-job.org). No toca ni interfiere con send-notifications.js (que sigue
// corriendo solo, una vez al día a las 8am, para pagos y cumpleaños).

const webpush = require('web-push');

const SUPABASE_URL = 'https://hymclqcdpplamdinfrhb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

function pad(n){ return String(n).padStart(2,'0'); }

// Hora actual en Bogotá, agrupada en bloques de 15 minutos (00, 15, 30, 45).
// Cada medicamento cae en UN solo bloque al día, así que aunque el cron
// externo se demore unos segundos, nunca se manda el mismo aviso dos veces.
function bloqueActualBogota(){
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', hour12:false,
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
  }).formatToParts(new Date());
  const get = (t)=> parts.find(p=>p.type===t).value;
  const fecha = get('year')+'-'+get('month')+'-'+get('day');
  const minutosDelDia = parseInt(get('hour'),10)*60 + parseInt(get('minute'),10);
  const bloque = Math.floor(minutosDelDia/15)*15;
  return { fecha, bloque };
}
function horaABloque(horaStr){
  const [h,m] = horaStr.split(':').map(Number);
  return Math.floor((h*60+m)/15)*15;
}

async function supaGet(path){
  const res = await fetch(SUPABASE_URL + path, {
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }
  });
  if(!res.ok) throw new Error('Supabase GET falló: '+path+' ('+res.status+')');
  return res.json();
}
async function supaDelete(path){
  await fetch(SUPABASE_URL + path, {
    method:'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }
  });
}

module.exports = async (req, res) => {
  const CRON_SECRET = process.env.CRON_SECRET;
  const recibido = req.query.key || req.headers['x-cron-key'];
  if(!CRON_SECRET || recibido !== CRON_SECRET){
    res.status(401).json({ error:'no_autorizado' });
    return;
  }
  if(!SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY){
    res.status(500).json({ error:'faltan_variables_de_entorno' });
    return;
  }

  webpush.setVapidDetails('mailto:nvelascop@ismm.edu.co', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const { fecha, bloque } = bloqueActualBogota();

  let usuarios;
  try{
    usuarios = await supaGet('/rest/v1/aienda_data?select=user_id,data');
  }catch(e){
    res.status(502).json({ error:'no_se_pudo_leer_usuarios' });
    return;
  }

  let revisados=0, enviados=0, errores=0;

  for(const fila of usuarios){
    const state = fila.data || {};
    const medsStatus = (state.medsStatus && state.medsStatus[fecha]) || {};
    const pendientes = [];

    (state.medicamentos||[]).forEach(m=>{
      (m.horarios||[]).forEach(h=>{
        if(horaABloque(h) === bloque){
          const statusKey = m.id+'|'+h;
          if(!medsStatus[statusKey]){
            pendientes.push({ nombre:m.nombre, dosis:m.dosis, hora:h });
          }
        }
      });
    });

    if(pendientes.length===0) continue;
    revisados++;

    let suscripciones;
    try{
      suscripciones = await supaGet('/rest/v1/aienda_push?user_id=eq.'+fila.user_id+'&select=endpoint,subscription');
    }catch(e){ continue; }

    for(const sub of suscripciones){
      for(const it of pendientes){
        const msg = { title:'💊 Hora de tu medicamento', body: it.nombre+(it.dosis?' — '+it.dosis:'')+' ('+it.hora+')' };
        try{
          await webpush.sendNotification(sub.subscription, JSON.stringify(msg));
          enviados++;
        }catch(err){
          errores++;
          if(err.statusCode===404 || err.statusCode===410){
            await supaDelete('/rest/v1/aienda_push?endpoint=eq.'+encodeURIComponent(sub.endpoint));
          }
        }
      }
    }
  }

  res.status(200).json({ ok:true, revisados, enviados, errores, bloque, fecha });
};
