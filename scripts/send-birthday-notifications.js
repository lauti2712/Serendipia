// Script que corre diariamente vía GitHub Actions.
// Revisa los cumpleaños de "hoy" y "mañana" y manda un email a todos los suscriptos.

const SUPABASE_URL = 'https://cmjiinrsmfxnqbefzttd.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const FROM_EMAIL = 'weareSerendipia <onboarding@resend.dev>'; // cambiar si tenés dominio verificado en Resend

if (!SUPABASE_SERVICE_KEY || !RESEND_API_KEY) {
  console.error('Faltan variables de entorno SUPABASE_SERVICE_KEY o RESEND_API_KEY');
  process.exit(1);
}

async function supa(path) {
  const res = await fetch(SUPABASE_URL + path, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }
  return res.json();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseMD(dateStr) {
  // birthdays.date format: '2000-MM-DD'
  const parts = dateStr.split('-').map(Number);
  return { m: parts[1], d: parts[2] };
}

async function main() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const todayMD = pad(today.getMonth() + 1) + '-' + pad(today.getDate());
  const tomorrowMD = pad(tomorrow.getMonth() + 1) + '-' + pad(tomorrow.getDate());

  console.log('Hoy (MM-DD):', todayMD, '| Mañana (MM-DD):', tomorrowMD);

  const birthdays = await supa('/rest/v1/birthdays?select=id,name,date');
  console.log('Cumpleaños cargados:', birthdays.length);

  const todays = [];
  const tomorrows = [];

  birthdays.forEach((b) => {
    const { m, d } = parseMD(b.date);
    const md = pad(m) + '-' + pad(d);
    if (md === todayMD) todays.push(b.name);
    if (md === tomorrowMD) tomorrows.push(b.name);
  });

  console.log('Cumpleaños hoy:', todays);
  console.log('Cumpleaños mañana:', tomorrows);

  if (todays.length === 0 && tomorrows.length === 0) {
    console.log('Sin cumpleaños hoy ni mañana. No se envía nada.');
    return;
  }

  const subscribers = await supa('/rest/v1/subscribers?select=email');
  console.log('Suscriptores:', subscribers.length);

  if (subscribers.length === 0) {
    console.log('Sin suscriptores. No se envía nada.');
    return;
  }

  let subject = '';
  let bodyLines = [];

  if (todays.length > 0) {
    const names = todays.join(', ');
    subject = todays.length === 1 ? `🎂 ¡Hoy es el cumpleaños de ${todays[0]}!` : `🎂 ¡Hoy cumplen años: ${names}!`;
    bodyLines.push(`<p style="font-size:18px;">🎉 <strong>¡Hoy es el cumpleaños de ${names}!</strong></p>`);
  }

  if (tomorrows.length > 0) {
    const names = tomorrows.join(', ');
    if (!subject) {
      subject = tomorrows.length === 1 ? `📅 Mañana es el cumpleaños de ${tomorrows[0]}` : `📅 Mañana cumplen años: ${names}`;
    }
    bodyLines.push(`<p style="font-size:16px;">📅 Mañana es el cumpleaños de <strong>${names}</strong>.</p>`);
  }

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #7B2FBE; border-radius: 16px; color: white;">
      <div style="text-align:center; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.7; margin-bottom: 16px;">weareSerendipia</div>
      ${bodyLines.join('\n')}
      <p style="font-size: 13px; opacity: 0.7; margin-top: 24px;">Recibiste este correo porque te suscribiste a los avisos de cumpleaños en weareSerendipia.</p>
    </div>
  `;

  for (const sub of subscribers) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: sub.email,
          subject,
          html,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        console.error('Error enviando a', sub.email, result);
      } else {
        console.log('Enviado a', sub.email, '-', result.id);
      }
    } catch (e) {
      console.error('Excepción enviando a', sub.email, e.message);
    }
  }

  console.log('Listo.');
}

main().catch((e) => {
  console.error('Error fatal:', e);
  process.exit(1);
});
