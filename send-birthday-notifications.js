// Script que corre diariamente vía GitHub Actions.
// Revisa los cumpleaños de "hoy" y "mañana" y manda un email a todos los suscriptos.

// ════════════════════════════════════════════════════════════
// 🎨 PERSONALIZÁ ACÁ EL TEXTO DEL EMAIL
// ════════════════════════════════════════════════════════════

// Nombre que aparece como remitente
const FROM_NAME = 'weareSerendipia';

// Asunto del mail cuando es HOY (puede usar {names} para los nombres)
const SUBJECT_TODAY_SINGLE = '🎂 ¡Hoy es el cumpleaños de {names}!';
const SUBJECT_TODAY_MULTI = '🎂 ¡Hoy cumplen años: {names}!';

// Asunto del mail cuando es MAÑANA (solo si no hay cumpleaños hoy)
const SUBJECT_TOMORROW_SINGLE = '📅 Mañana es el cumpleaños de {names}';
const SUBJECT_TOMORROW_MULTI = '📅 Mañana cumplen años: {names}';

// Texto principal dentro del mail para HOY
const BODY_TODAY = '🎉 <strong>¡Hoy es el cumpleaños de {names}!</strong> Mandale un mensajito, llamalo, o pasá a saludar 🎂';

// Texto principal dentro del mail para MAÑANA
const BODY_TOMORROW = '📅 Mañana es el cumpleaños de <strong>{names}</strong>. ¡No te olvides!';

// Pie de página del mail
const FOOTER_TEXT = 'Recibiste este correo porque te suscribiste a los avisos de cumpleaños en weareSerendipia.';

// ════════════════════════════════════════════════════════════
// A partir de acá es lógica del script, no hace falta tocarlo
// ════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://cmjiinrsmfxnqbefzttd.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const FROM_EMAIL = `${FROM_NAME} <onboarding@resend.dev>`; // cambiar el dominio si verificás uno propio en Resend

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

function fill(template, names) {
  return template.replace('{names}', names);
}

async function main() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const todayMD = pad(today.getMonth() + 1) + '-' + pad(today.getDate());
  const tomorrowMD = pad(tomorrow.getMonth() + 1) + '-' + pad(tomorrow.getDate());

  console.log('Hoy (MM-DD):', todayMD, '| Mañana (MM-DD):', tomorrowMD);

  const birthdays = await supa('/rest/v1/birthdays?select=id,name,date,bio,nickname');
  console.log('Cumpleaños cargados:', birthdays.length);

  const todays = [];
  const tomorrows = [];

  birthdays.forEach((b) => {
    const { m, d } = parseMD(b.date);
    const md = pad(m) + '-' + pad(d);
    if (md === todayMD) todays.push({ name: b.name, bio: b.bio || '', nickname: b.nickname || '' });
    if (md === tomorrowMD) tomorrows.push({ name: b.name, bio: b.bio || '', nickname: b.nickname || '' });
  });

  console.log('Cumpleaños hoy:', todays.map(b=>b.name));
  console.log('Cumpleaños mañana:', tomorrows.map(b=>b.name));

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
    const names = todays.map(b => b.name).join(', ');
    subject = fill(todays.length === 1 ? SUBJECT_TODAY_SINGLE : SUBJECT_TODAY_MULTI, names);
    todays.forEach(b => {
      const nickLine = b.nickname ? `<p style="font-size:13px;opacity:0.75;margin-top:-8px;">🏅 <em>${b.nickname}</em></p>` : '';
      const bioLine = b.bio ? `<p style="font-size:14px;opacity:0.85;margin-top:0;font-style:italic;">"${b.bio}"</p>` : '';
      bodyLines.push(`<p style="font-size:18px;margin-bottom:4px;">🎉 <strong>¡Hoy es el cumpleaños de ${b.name}!</strong></p>${nickLine}${bioLine}`);
    });
  }

  if (tomorrows.length > 0) {
    const names = tomorrows.map(b => b.name).join(', ');
    if (!subject) {
      subject = fill(tomorrows.length === 1 ? SUBJECT_TOMORROW_SINGLE : SUBJECT_TOMORROW_MULTI, names);
    }
    tomorrows.forEach(b => {
      const nickLine = b.nickname ? `<p style="font-size:13px;opacity:0.75;margin-top:-8px;">🏅 <em>${b.nickname}</em></p>` : '';
      const bioLine = b.bio ? `<p style="font-size:14px;opacity:0.85;margin-top:0;font-style:italic;">"${b.bio}"</p>` : '';
      bodyLines.push(`<p style="font-size:16px;margin-bottom:4px;">📅 Mañana es el cumpleaños de <strong>${b.name}</strong>.</p>${nickLine}${bioLine}`);
    });
  }

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #7B2FBE; border-radius: 16px; color: white;">
      <div style="text-align:center; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.7; margin-bottom: 16px;">${FROM_NAME}</div>
      ${bodyLines.join('\n')}
      <p style="font-size: 13px; opacity: 0.7; margin-top: 24px;">${FOOTER_TEXT}</p>
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
