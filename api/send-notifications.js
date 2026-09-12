// api/send-notifications.js
// Esta función la llama Vercel solo, una vez al día (ver vercel.json), a las 8am
// hora Colombia. Revisa a cada persona suscrita y le envía UN mensaje si tiene
// algo pendiente: pagos por vencer, cumpleaños de hoy, o medicamentos del día.
//
// IMPORTANTE: esta es la única función que necesita la "llave maestra" de Supabase
// (SUPABASE_SERVICE_ROLE_KEY), porque tiene que leer los datos de TODOS los usuarios,
// no solo los de uno. Esa llave nunca debe usarse en ninguna otra parte del código.

const webpush = require('web-push');

const SUPABASE_URL = 'https://hymclqcdpplamdinfrhb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

function pad(n){ return String(n).padStart(2,'0'); }

function pagoInfo(pago, today, pagosStatus){
  function lastDay(y,m){ return new Date(y,m+1,0).getDate(); }
  function dueDateFor(y,m,dia){ return new Date(y,m,Math.min(dia,lastDay(y,m))); }
  function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
  function avanzar(y,m){
    if(pago.frecuencia!=='bimestral') return {y,m};
    const paridad = (pago.mesInicio||0)%2;
    while(m%2!==paridad){ m++; if(m>11){ m=0; y++; } }
    return {y,m};
  }
  let y=today.getFullYear(), m=today.getMonth();
  ({y,m}=avanzar(y,m));
  let due = dueDateFor(y,m,pago.dia);
  if(startOfDay(due) < startOfDay(today)){
    m++; if(m>11){ m=0; y++; }
    ({y,m}=avanzar(y,m));
    due = dueDateFor(y,m,pago.dia);
  }
  const key = due.getFullYear()+'-'+pad(due.getMonth()+1);
  const paid = !!(pagosStatus[pago.id] && pagosStatus[pago.id][key]);
  const diffDays = Math.round((startOfDay(due)-startOfDay(today))/86400000);
  return { diffDays, paid };
}

function construirAlertas(state){
  const hoy = new Date();
  const mensajes = [];

  (state.pagos||[]).forEach(p=>{
    const info = pagoInfo(p, hoy, state.pagosStatus||{});
    if(!info.paid && (info.diffDays===0 || info.diffDays===3)){
      mensajes.push('Pago "'+p.nombre+'" '+(info.diffDays===0?'vence hoy':'vence en 3 días'));
    }
  });

  (state.cumpleanos||[]).forEach(c=>{
    if(c.dia===hoy.getDate() && c.mes===(hoy.getMonth()+1)){
      mensajes.push('Hoy es el cumpleaños de '+c.nombre);
    }
  });

  const keyHoy = hoy.getFullYear()+'-'+pad(hoy.getMonth()+1)+'-'+pad(hoy.getDate());
  const statusMap = (state.medsStatus && state.medsStatus[keyHoy]) || {};
  (state.medicamentos||[]).forEach(m=>{
    (m.horarios||[]).forEach(h=>{
      if(!statusMap[m.id+'|'+h]) mensajes.push(m.nombre+' ('+h+')');
    });
  });

  return mensajes;
}

module.exports = async (req, res) => {
  if(!SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY){
    res.status(500).json({ error: 'server_misconfigured' });
    return;
  }
  webpush.setVapidDetails('mailto:nvelascop@ismm.edu.co', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  try{
    const subsRes = await fetch(SUPABASE_URL + '/rest/v1/aienda_push?select=user_id,subscription', {
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }
    });
    const subs = await subsRes.json();

    let enviados = 0;
    for(const row of subs){
      const dataRes = await fetch(SUPABASE_URL + '/rest/v1/aienda_data?user_id=eq.' + row.user_id + '&select=data', {
        headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }
      });
      const dataRows = await dataRes.json();
      if(!dataRows[0]) continue;

      const mensajes = construirAlertas(dataRows[0].data || {});
      if(mensajes.length===0) continue;

      try{
        await webpush.sendNotification(row.subscription, JSON.stringify({
          title: 'Aienda',
          body: mensajes.join(' · ')
        }));
        enviados++;
      }catch(err){
        if(err.statusCode===410 || err.statusCode===404){
          await fetch(SUPABASE_URL + '/rest/v1/aienda_push?user_id=eq.' + row.user_id, {
            method: 'DELETE',
            headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }
          });
        }
      }
    }

    res.status(200).json({ ok:true, revisados: subs.length, enviados });
  }catch(err){
    res.status(500).json({ error: 'server_error' });
  }
};
