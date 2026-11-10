import { store, iniciar, on, modoDemo } from './store.js?v=202611101257';
import {
  calcularTorneo, partidosDeGrupo, golpesEnHoyo, handicapCampo, handicapJuego, parTotal, fmtPts, HOYOS, LEVANTADA,
  clasificacion,
} from './golf.js?v=202611101257';
import { equilibrarEquipos, generarPartidos } from './pairing.js?v=202611101257';
import { configInicial } from './defaults.js?v=202611101257';

const S = {
  cfg: null,
  scores: {},
  rol: null,
  cargado: false,
  tab: {}, // gid -> 'apuntar' | 'tarjeta'
  hoyo: {}, // gid -> número de hoyo seleccionado
  draft: {}, // `${gid}:${hoyo}` -> { pid: valor }
  ad: null, // borrador de config en admin
  pins: {},
  adMsg: '',
  historial: {},
  abiertos: new Set(), // jugadores desplegados en la clasificación individual
};

const $app = document.getElementById('app');
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

function ruta() {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  if (a === 'g' && b) return { pag: 'grupo', gid: b };
  if (a === 'admin') return { pag: 'admin' };
  if (a === 'individual') return { pag: 'individual' };
  return { pag: 'marcador' };
}

function colores(cfg) {
  const r = document.documentElement.style;
  r.setProperty('--a', cfg?.equipos?.A?.color || '#1d4ed8');
  r.setProperty('--b', cfg?.equipos?.B?.color || '#b91c1c');
}

const nombres = (cfg) => Object.fromEntries((cfg?.jugadores || []).map((j) => [j.id, j.nombre]));
const nGrupo = (cfg, gid) => (cfg.grupos.findIndex((g) => g.id === gid) + 1) || gid;

// ------------------------------------------------------------------ cabecera
function cabecera(r) {
  const cfg = S.cfg;
  const sub = [cfg?.campo?.nombre, cfg?.fecha && new Date(cfg.fecha + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })]
    .filter(Boolean)
    .join(' · ');
  const grupos = (cfg?.grupos || [])
    .map((g, i) => `<a href="#/g/${g.id}" class="${r.gid === g.id ? 'on' : ''}">Grupo ${i + 1}</a>`)
    .join('');
  return `<header class="top"><div class="wrap">
    <h1>⛳ ${esc(cfg?.nombre || 'Ryder Cup Terramar')}</h1>
    <div class="sub">${esc(sub || 'Club de Golf Terramar (Sitges)')}</div>
    <nav><a href="#/" class="${r.pag === 'marcador' ? 'on' : ''}">Marcador</a>${grupos}
    <a href="#/individual" class="${r.pag === 'individual' ? 'on' : ''}">Individual</a>
    <a href="#/admin" class="${r.pag === 'admin' ? 'on' : ''}">Admin</a></nav>
  </div></header>`;
}

function avisoDemo() {
  return modoDemo
    ? `<div class="banner"><b>Modo demo:</b> los datos se guardan solo en este navegador (prueba con dos pestañas a la vez).
       PIN admin <b>1234</b>. Para usarlo de verdad, pon la configuración de Firebase en <code>js/firebase-config.js</code>.</div>`
    : '';
}

// ------------------------------------------------------------------ chips de partido
function chip(e) {
  if (e.jugados === 0) return `<div class="chip">—<small>sin empezar</small></div>`;
  const cls = e.lider === 'A' ? 'ta' : e.lider === 'B' ? 'tb' : '';
  const sub = e.final ? 'Final' : e.dormie ? `dormie · ${e.jugados}` : `tras ${e.jugados}`;
  return `<div class="chip ${cls} ${e.final ? 'fin' : ''}">${esc(e.texto)}<small>${sub}</small></div>`;
}

function filaPartido(p, nom) {
  const lado = (ids) => ids.map((id) => esc(nom[id])).join(' + ');
  return `<div class="partido">
    <div class="tipo">${p.tipo}</div>
    <div class="cruce">
      <div class="lado a">${lado(p.lados[0])}</div>
      ${chip(p.estado)}
      <div class="lado b">${lado(p.lados[1])}</div>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ marcador
function vistaMarcador() {
  const cfg = S.cfg;
  if (!cfg) {
    return `<div class="wrap">${avisoDemo()}<div class="card" style="margin-top:16px">
      El torneo aún no está configurado. Entra en <a href="#/admin">Admin</a> para crear equipos y partidos.</div></div>`;
  }
  const T = calcularTorneo(cfg, S.scores);
  const nom = nombres(cfg);
  const [ca, cb] = T.total.conf;
  const [pa, pb] = T.total.proy;
  const enJuegoPend = T.enJuego - ca - cb;
  let ganador = '';
  if (ca >= T.objetivo) ganador = `🏆 ¡${esc(cfg.equipos.A.nombre)} gana la Ryder Cup!`;
  else if (cb >= T.objetivo) ganador = `🏆 ¡${esc(cfg.equipos.B.nombre)} gana la Ryder Cup!`;
  else if (enJuegoPend === 0 && T.enJuego > 0) ganador = 'Empate';
  const w = (v) => `${(v / T.enJuego) * 100}%`;
  const grupos = T.grupos
    .map((g, i) => {
      const maxJ = Math.max(...g.partidos.map((p) => p.estado.jugados));
      const info = g.partidos.every((p) => p.estado.final) ? 'Terminado' : maxJ ? `Hoyo ${Math.min(maxJ + 1, 18)}` : g.hora ? `Sale ${esc(g.hora)}` : 'Sin empezar';
      return `<a class="grupo" href="#/g/${g.id}">
        <div class="cab"><b>Grupo ${i + 1}</b><small>${info} ›</small></div>
        ${g.partidos.map((p) => filaPartido(p, nom)).join('')}
      </a>`;
    })
    .join('');
  return `<div class="wrap">${avisoDemo()}
    <section class="marcador">
      <div class="equipos">
        <div class="eq"><div class="pts" style="color:var(--a)">${fmtPts(ca)}</div><div class="nom">${esc(cfg.equipos.A.nombre)}</div></div>
        <div class="vs">${T.enJuego} pts<br>gana con ${fmtPts(T.objetivo)}</div>
        <div class="eq"><div class="pts" style="color:var(--b)">${fmtPts(cb)}</div><div class="nom">${esc(cfg.equipos.B.nombre)}</div></div>
      </div>
      <div class="barra"><span style="width:${w(ca)};background:var(--a)"></span><span style="flex:1"></span><span style="width:${w(cb)};background:var(--b)"></span><i class="meta"></i></div>
      <div class="leyenda"><span>En directo (si acabase ahora): <b>${fmtPts(pa)} – ${fmtPts(pb)}</b></span><span>${fmtPts(enJuegoPend)} en juego</span></div>
      ${ganador ? `<div class="ganador">${ganador}</div>` : ''}
    </section>
    <h2>Partidos · parejas e individuales a la vez</h2>
    ${grupos}
    <p class="muted">Cada grupo juega 18 hoyos y 3 partidos a la vez: uno por parejas y dos individuales. En el de parejas cada hoyo vale 2: uno a la mejor bola y otro a la peor (si ganas los dos, 2 UP en ese hoyo). Cada partido da 1 punto a la Ryder (empate = ½).
    ${cfg.handicap.activo ? `Con hándicap (${cfg.handicap.pctIndividual}% individual, ${cfg.handicap.pctFourball}% parejas).` : 'Scratch (sin hándicap).'}</p>
  </div>`;
}

// ------------------------------------------------------------------ grupo
// Guardado automático: cada toque se sube a Firebase al cabo de un momento.
const temporizadores = {};
S.estadoGuardado = {}; // key -> 'pendiente' | 'guardando' | 'ok' | 'error'
function programarGuardado(gid, h) {
  const key = `${gid}:${h}`;
  S.estadoGuardado[key] = 'pendiente';
  clearTimeout(temporizadores[key]);
  temporizadores[key] = setTimeout(() => guardarHoyo(gid, h), 700);
}
async function guardarHoyo(gid, h) {
  const key = `${gid}:${h}`;
  const valores = S.draft[key];
  if (!valores) return;
  const enviado = { ...valores };
  S.estadoGuardado[key] = 'guardando';
  const p = store.apuntar(gid, h, enviado);
  // Los golpes ya están en la caché local de Firebase: quitamos del borrador lo enviado
  // (salvo lo que se haya vuelto a tocar mientras tanto).
  for (const [id, v] of Object.entries(enviado)) if (S.draft[key]?.[id] === v) delete S.draft[key][id];
  if (S.draft[key] && !Object.keys(S.draft[key]).length) delete S.draft[key];
  try {
    await p;
    if (S.estadoGuardado[key] === 'guardando') S.estadoGuardado[key] = 'ok';
  } catch (e) {
    console.error(e);
    S.estadoGuardado[key] = 'error';
    (S.draft[key] ||= {});
    for (const [id, v] of Object.entries(enviado)) if (!(id in S.draft[key])) S.draft[key][id] = v;
    toast('No se ha podido guardar: ' + (e.message || e));
  }
  if (ruta().pag === 'grupo') render();
}

function hoyoInicial(gid, g) {
  const sc = S.scores[gid]?.h || {};
  const ids = [...g.a, ...g.b];
  for (let h = 1; h <= HOYOS; h++) if (!ids.every((id) => sc[h]?.[id] != null)) return h;
  return HOYOS;
}

function vistaGrupo(gid) {
  const cfg = S.cfg;
  const g = cfg?.grupos?.find((x) => x.id === gid);
  if (!g) return `<div class="wrap"><div class="card" style="margin-top:16px">Grupo no encontrado. <a href="#/">Volver</a></div></div>`;
  const tab = S.tab[gid] || 'apuntar';
  const T = calcularTorneo(cfg, S.scores);
  const tg = T.grupos.find((x) => x.id === gid);
  const nom = nombres(cfg);
  const cuerpo = tab === 'apuntar' ? vistaApuntar(g, tg, nom) : vistaTarjeta(g, tg, nom);
  return `<div class="wrap">${avisoDemo()}
    <div class="card" style="margin-top:16px">
      <div class="cab" style="display:flex;justify-content:space-between"><b>Grupo ${nGrupo(cfg, gid)}</b><small class="muted">${g.hora ? 'Salida ' + esc(g.hora) : ''}</small></div>
      ${tg.partidos.map((p) => filaPartido(p, nom)).join('')}
    </div>
    <div class="tabs">
      <button data-act="tab" data-v="apuntar" class="${tab === 'apuntar' ? 'on' : ''}">Apuntar</button>
      <button data-act="tab" data-v="tarjeta" class="${tab === 'tarjeta' ? 'on' : ''}">Tarjeta</button>
    </div>
    ${cuerpo}
  </div>`;
}

function formPin(rol, titulo) {
  return `<div class="card">
    <b>${titulo}</b>
    <label for="pin">PIN</label>
    <input id="pin" class="pin-input" type="password" inputmode="numeric" autocomplete="off" maxlength="8">
    <div class="acciones"><button class="btn" data-act="entrar" data-v="${rol}">Entrar</button></div>
    <div class="err" id="pin-err"></div>
  </div>`;
}

function vistaApuntar(g, tg, nom) {
  const gid = g.id;
  const cfg = S.cfg;
  const h = (S.hoyo[gid] ||= hoyoInicial(gid, g));
  const sc = tg.scores;
  const ids = [g.a[0], g.b[0], g.a[1], g.b[1]]; // rivales del individual juntos
  const key = `${gid}:${h}`;
  const val = (id) => (S.draft[key] && id in S.draft[key] ? S.draft[key][id] : sc[h]?.[id] ?? null);
  const par = cfg.campo.par[h - 1];
  const si = cfg.campo.si[h - 1];
  const [fb, i1, i2] = tg.partidos;
  const indDe = (id) => (i1.lados.flat().includes(id) ? i1 : i2);

  const botones = Array.from({ length: HOYOS }, (_, i) => {
    const n = i + 1;
    const c = ids.filter((id) => sc[n]?.[id] != null).length;
    const cls = n === h ? 'on' : c === 4 ? 'ok' : c ? 'parcial' : '';
    return `<button data-act="hoyo" data-v="${n}" class="${cls}">${n}</button>`;
  }).join('');

  const filas = ids
    .map((id) => {
      const eq = g.a.includes(id) ? 'A' : 'B';
      const v = val(id);
      let rec = '';
      if (cfg.handicap.activo) {
        const gi = golpesEnHoyo(indDe(id).hj[id] || 0, si);
        const gf = golpesEnHoyo(fb.hj[id] || 0, si);
        if (gi || gf) rec = `<small>recibe ${'●'.repeat(gi) || '0'} en individual · ${'●'.repeat(gf) || '0'} en parejas</small>`;
      }
      const txt = v === LEVANTADA ? 'X' : v ?? '·';
      return `<div class="jug">
        <div class="nm"><span class="dot" style="background:var(--${eq.toLowerCase()})"></span>${esc(nom[id])}${rec}</div>
        <div class="stepper">
          <button data-act="menos" data-v="${id}" aria-label="Menos">−</button>
          <span class="v ${v == null ? 'vacio' : ''}">${txt}</span>
          <button data-act="mas" data-v="${id}" aria-label="Más">+</button>
          <button class="x ${v === LEVANTADA ? 'on' : ''}" data-act="levantar" data-v="${id}" title="Bola levantada">X</button>
        </div>
      </div>`;
    })
    .join('');

  const res = (p) => {
    const r = p.estado.hoyos[h - 1];
    if (!r) return '—';
    if (r.muerto) return 'partido ya decidido';
    return r.r === 'A' ? esc(cfg.equipos.A.nombre) : r.r === 'B' ? esc(cfg.equipos.B.nombre) : 'empatado';
  };
  const nomEq = (k) => esc(cfg.equipos[k].nombre);
  const resParejas = (p) => {
    const r = p.estado.hoyos[h - 1];
    if (!r) return '—';
    if (r.muerto) return 'partido ya decidido';
    const lado = (v) => (v > 0 ? nomEq('A') : v < 0 ? nomEq('B') : 'empate');
    const tot = r.d === 0 ? 'hoyo empatado' : `${lado(r.d)} +${Math.abs(r.d)}`;
    return `${tot} <span class="muted">(mejor bola: ${lado(r.mejor)} · peor bola: ${lado(r.peor)})</span>`;
  };
  const eg = S.estadoGuardado[key];
  const estadoTxt =
    eg === 'pendiente' || eg === 'guardando' ? 'Guardando…'
    : eg === 'error' ? '⚠️ No se ha guardado: toca otra vez'
    : eg === 'ok' ? '✓ Guardado' : 'Se guarda solo al tocar';
  return `<div class="hoyos">${botones}</div>
    <div class="card">
      <div class="hoyo-cab"><div class="n">Hoyo ${h}</div><div class="info">Par ${par}${cfg.campo.metros ? ` · ${cfg.campo.metros[h - 1]} m` : ''}<br>Índice ${si}</div></div>
      ${filas}
      <div class="acciones">
        <button class="btn sec" data-act="hoyo" data-v="${Math.max(1, h - 1)}">‹</button>
        <div class="guardado ${eg === 'error' ? 'err' : ''}">${estadoTxt}</div>
        <button class="btn sec" data-act="hoyo" data-v="${Math.min(HOYOS, h + 1)}">›</button>
      </div>
      <div class="estado-hoyo">
        <div>Parejas: <b>${resParejas(fb)}</b></div>
        <div>${esc(nom[i1.lados[0][0]])} – ${esc(nom[i1.lados[1][0]])}: <b>${res(i1)}</b></div>
        <div>${esc(nom[i2.lados[0][0]])} – ${esc(nom[i2.lados[1][0]])}: <b>${res(i2)}</b></div>
      </div>
    </div>
    <p class="muted">Pon los golpes brutos: la web aplica los hándicaps. <b>X</b> = bola levantada (pierde el hoyo en su individual y la peor bola de su pareja; en la mejor bola cuenta la de su compañero). Hay que acabar cada hoyo, porque los golpes de los dos cuentan.</p>`;
}

function vistaTarjeta(g, tg, nom) {
  const cfg = S.cfg;
  const sc = tg.scores;
  const ids = [g.a[0], g.a[1], g.b[0], g.b[1]];
  const [fb, i1, i2] = tg.partidos;
  const indDe = (id) => (i1.lados.flat().includes(id) ? i1 : i2);
  const mitad = (desde) => {
    const hs = Array.from({ length: 9 }, (_, i) => desde + i);
    const tot = (f) => hs.reduce((s, h) => s + (Number(f(h)) || 0), 0);
    const cab = `<tr><th>Hoyo</th>${hs.map((h) => `<th>${h}</th>`).join('')}<th>${desde === 1 ? 'Ida' : 'Vta'}</th></tr>`;
    const par = `<tr class="par"><td>Par</td>${hs.map((h) => `<td>${cfg.campo.par[h - 1]}</td>`).join('')}<td>${tot((h) => cfg.campo.par[h - 1])}</td></tr>`;
    const si = `<tr class="si"><td>Índice</td>${hs.map((h) => `<td>${cfg.campo.si[h - 1]}</td>`).join('')}<td></td></tr>`;
    const jug = ids
      .map((id) => {
        const eq = g.a.includes(id) ? 'a' : 'b';
        const hj = indDe(id).hj[id] || 0;
        const celdas = hs
          .map((h) => {
            const v = sc[h]?.[id];
            const gi = cfg.handicap.activo ? golpesEnHoyo(hj, cfg.campo.si[h - 1]) : 0;
            return `<td>${v ?? ''}${gi ? `<sup>${'•'.repeat(gi)}</sup>` : ''}</td>`;
          })
          .join('');
        return `<tr><td><span class="dot" style="background:var(--${eq})"></span>${esc(nom[id])}</td>${celdas}<td>${tot((h) => (sc[h]?.[id] === LEVANTADA ? 0 : sc[h]?.[id])) || ''}</td></tr>`;
      })
      .join('');
    const fila = (p, et) =>
      `<tr><td>${et}</td>${hs
        .map((h) => {
          const r = p.estado.hoyos[h - 1];
          if (!r) return '<td></td>';
          const k = r.r === '=' ? 'E' : r.r;
          const txt = r.r === '=' ? '½' : p.estado.porHoyo > 1 ? String(Math.abs(r.d)) : '●';
          return `<td class="${r.muerto ? 'muerto' : ''}"><span class="r ${k}">${txt}</span></td>`;
        })
        .join('')}<td></td></tr>`;
    return `<div class="card scroll"><table class="tj">${cab}${par}${si}${jug}
      ${fila(fb, 'Parejas')}
      ${fila(i1, 'Ind. 1')}
      ${fila(i2, 'Ind. 2')}
    </table></div>`;
  };
  return `${mitad(1)}${mitad(10)}
    <p class="muted">Ind. 1 = ${esc(nom[i1.lados[0][0]])} – ${esc(nom[i1.lados[1][0]])} · Ind. 2 = ${esc(nom[i2.lados[0][0]])} – ${esc(nom[i2.lados[1][0]])}.<br>
    • = golpe de hándicap en el individual. Color = quién gana el hoyo; en Parejas, el número es cuántos puntos se lleva (1 o 2); ½ = empatado.</p>`;
}


// ------------------------------------------------------------------ individual (scratch + stableford)
function vistaIndividual() {
  const cfg = S.cfg;
  if (!cfg) return `<div class="wrap"><div class="card" style="margin-top:16px">El torneo aún no está configurado.</div></div>`;
  const orden = S.ordenInd || 'stb';
  const lista = clasificacion(cfg, S.scores);
  const conJuego = (a, b) => (b.jugados > 0) - (a.jugados > 0);
  lista.sort((a, b) =>
    conJuego(a, b) ||
    (orden === 'stb'
      ? b.puntos - a.puntos || a.vsPar - b.vsPar
      : a.levantadas - b.levantadas || a.vsPar - b.vsPar || b.puntos - a.puntos),
  );
  const tee = cfg.campo.tees[cfg.campo.tee];
  const vp = (j) => (j.jugados - j.levantadas === 0 ? '—' : j.vsPar === 0 ? 'E' : j.vsPar > 0 ? `+${j.vsPar}` : `${j.vsPar}`);
  let pos = 0;
  let prev = null;
  const filas = lista
    .map((j, i) => {
      const clave = orden === 'stb' ? j.puntos : `${j.levantadas}:${j.vsPar}`;
      if (clave !== prev) pos = i + 1;
      prev = clave;
      const eq = j.equipo.toLowerCase();
      const hs = (desde) =>
        Array.from({ length: 9 }, (_, k) => {
          const h = desde + k;
          const x = j.hoyos[h - 1];
          return `<td>${x.g ?? ''}${x.rec ? `<sup>${'•'.repeat(x.rec)}</sup>` : ''}<br><small class="muted">${x.pts ?? ''}</small></td>`;
        }).join('');
      const cab = (desde) => Array.from({ length: 9 }, (_, k) => `<th>${desde + k}</th>`).join('');
      const pars = (desde) => Array.from({ length: 9 }, (_, k) => `<td>${cfg.campo.par[desde + k - 1]}</td>`).join('');
      return `<details class="ind" data-ind="${j.id}" ${S.abiertos.has(j.id) ? 'open' : ''}>
        <summary>
          <span class="pos">${j.jugados ? pos : '–'}</span>
          <span class="nm"><span class="dot" style="background:var(--${eq})"></span>${esc(j.nombre)} <small class="muted">(${j.hi} · juega ${j.hj})</small></span>
          <span class="num"><b>${j.jugados - j.levantadas ? j.bruto : '—'}</b><small>${vp(j)}</small></span>
          <span class="num"><b>${j.puntos}</b><small>pts</small></span>
          <span class="num"><b>${j.jugados}</b><small>hoyos</small></span>
        </summary>
        <div class="scroll"><table class="tj">
          <tr><th>Hoyo</th>${cab(1)}</tr><tr class="par"><td>Par</td>${pars(1)}</tr><tr><td>Golpes<br><small class="muted">Pts</small></td>${hs(1)}</tr>
          <tr><th>Hoyo</th>${cab(10)}</tr><tr class="par"><td>Par</td>${pars(10)}</tr><tr><td>Golpes<br><small class="muted">Pts</small></td>${hs(10)}</tr>
        </table></div>
        ${j.levantadas ? `<div class="muted">${j.levantadas} bola(s) levantada(s): no cuentan para el total scratch y dan 0 puntos stableford.</div>` : ''}
      </details>`;
    })
    .join('');
  return `<div class="wrap">${avisoDemo()}
    <div class="tabs">
      <button data-act="orden-ind" data-v="stb" class="${orden === 'stb' ? 'on' : ''}">Stableford</button>
      <button data-act="orden-ind" data-v="scratch" class="${orden === 'scratch' ? 'on' : ''}">Scratch</button>
    </div>
    <div class="card ind-lista">
      <div class="ind-cab"><span class="pos">#</span><span class="nm">Jugador</span><span class="num">Golpes</span><span class="num">Stbl.</span><span class="num">Jug.</span></div>
      ${filas}
    </div>
    <p class="muted">Todos desde barras ${esc(tee?.nombre?.toLowerCase() || '')} (CR ${tee?.cr} / Slope ${tee?.slope}). Golpes = total scratch y diferencia con el par de los hoyos jugados.
    Stableford con el ${cfg.handicap.pctStableford ?? 95}% del hándicap de campo ("juega"): 2 puntos por el par neto, +1 por cada golpe menos. • = golpe recibido. Pulsa en un jugador para ver su tarjeta.</p>
  </div>`;
}

// ------------------------------------------------------------------ admin
function vistaAdmin() {
  if (S.rol !== 'admin') {
    return `<div class="wrap">${avisoDemo()}<div style="margin-top:16px"></div>
      ${formPin('admin', 'Acceso de administrador')}
      ${!S.cfg ? `<div class="card"><b>¿Primera vez?</b><p class="muted">Elige un PIN de admin (mínimo 4 cifras; mejor 6). Solo se puede crear una vez.</p>
        <input id="pin-nuevo" class="pin-input" type="password" inputmode="numeric" maxlength="8">
        <div class="acciones"><button class="btn" data-act="crear-admin">Crear PIN de admin</button></div><div class="err" id="crear-err"></div></div>` : ''}
    </div>`;
  }
  if (!S.ad) S.ad = clone(S.cfg || configInicial());
  const c = S.ad;
  const tees = c.campo.tees;
  const tee = tees[c.campo.tee];
  const pt = parTotal(c.campo.par);
  const opts = (eq, sel) =>
    c.jugadores
      .filter((j) => j.equipo === eq)
      .map((j) => `<option value="${j.id}" ${j.id === sel ? 'selected' : ''}>${esc(j.nombre)} (${j.hi})</option>`)
      .join('');
  const inp = (path, v, type = 'text', extra = '') =>
    `<input type="${type}" data-bind="${path}" ${type === 'number' ? 'data-num="1" step="any"' : ''} value="${esc(v)}" ${extra}>`;

  const jugadores = c.jugadores
    .map(
      (j, i) => `<div class="fila3">
        <div>${inp(`jugadores.${i}.nombre`, j.nombre, 'text', 'aria-label="Nombre"')}</div>
        <div>${inp(`jugadores.${i}.hi`, j.hi, 'number', 'aria-label="Hándicap" inputmode="decimal"')}</div>
        <div><select data-bind="jugadores.${i}.equipo" data-rerender="1" aria-label="Equipo">
          <option value="A" ${j.equipo === 'A' ? 'selected' : ''}>${esc(c.equipos.A.nombre)}</option>
          <option value="B" ${j.equipo === 'B' ? 'selected' : ''}>${esc(c.equipos.B.nombre)}</option></select></div>
      </div>
      <div class="muted" style="margin:-2px 0 6px">Hándicap de campo (${esc(tee.nombre)}): ${handicapCampo(j.hi, tee, pt)} · stableford ${handicapJuego(j.hi, tee, pt, c.handicap.pctStableford ?? 95)}</div>`,
    )
    .join('');

  const grupos = c.grupos
    .map(
      (g, i) => `<div class="gr-edit">
        <b>Grupo ${i + 1}</b>
        <div class="fila"><div><label>Hora de salida</label>${inp(`grupos.${i}.hora`, g.hora, 'time')}</div><div></div></div>
        <div class="fila">
          <div><label>${esc(c.equipos.A.nombre)} 1</label><select data-bind="grupos.${i}.a.0">${opts('A', g.a[0])}</select></div>
          <div><label>${esc(c.equipos.B.nombre)} 1</label><select data-bind="grupos.${i}.b.0">${opts('B', g.b[0])}</select></div>
          <div><label>${esc(c.equipos.A.nombre)} 2</label><select data-bind="grupos.${i}.a.1">${opts('A', g.a[1])}</select></div>
          <div><label>${esc(c.equipos.B.nombre)} 2</label><select data-bind="grupos.${i}.b.1">${opts('B', g.b[1])}</select></div>
        </div>
        <div class="muted">Parejas (mejor + peor bola): 1+2 contra 1+2 · Individuales: 1 contra 1 y 2 contra 2</div>
        <div class="acciones"><button class="btn sec" data-act="historial" data-v="${g.id}">Ver últimos cambios</button></div>
        ${S.historial[g.id] ? `<div class="muted">${S.historial[g.id]}</div>` : ''}
      </div>`,
    )
    .join('');

  const mini = (k) =>
    c.campo[k].map((v, i) => `<input type="number" data-num="1" data-bind="campo.${k}.${i}" value="${v}" aria-label="${k} hoyo ${i + 1}">`).join('');
  const teesHtml = Object.entries(tees)
    .map(
      ([k, t]) => `<div class="fila3"><div><label>${esc(t.nombre)}</label></div>
        <div><label>CR</label>${inp(`campo.tees.${k}.cr`, t.cr, 'number')}</div>
        <div><label>Slope</label>${inp(`campo.tees.${k}.slope`, t.slope, 'number')}</div></div>`,
    )
    .join('');

  return `<div class="wrap">${avisoDemo()}
    ${S.adMsg ? `<div class="banner">${S.adMsg}</div>` : ''}
    <h2>Torneo</h2>
    <div class="card">
      <label>Nombre</label>${inp('nombre', c.nombre)}
      <label>Fecha</label>${inp('fecha', c.fecha, 'date')}
      <div class="fila">
        <div><label>Equipo 1</label><div style="display:flex;gap:6px">${inp('equipos.A.color', c.equipos.A.color, 'color')}${inp('equipos.A.nombre', c.equipos.A.nombre)}</div></div>
        <div><label>Equipo 2</label><div style="display:flex;gap:6px">${inp('equipos.B.color', c.equipos.B.color, 'color')}${inp('equipos.B.nombre', c.equipos.B.nombre)}</div></div>
      </div>
    </div>

    <h2>Jugadores (nombre · hándicap · equipo)</h2>
    <div class="card">${jugadores}
      <div class="acciones">
        <button class="btn sec" data-act="equilibrar">⚖️ Hacer equipos igualados</button>
        <button class="btn" data-act="generar">🎲 Generar partidos</button>
      </div>
      <p class="muted">"Hacer equipos igualados" reparte a los 12 en dos equipos con la misma suma de hándicaps.
      "Generar partidos" busca, entre las 10.800 combinaciones posibles, las de individuales entre jugadores de nivel parecido y parejas equilibradas. Puedes pulsarlo varias veces para ver alternativas.</p>
    </div>

    <h2>Partidos de cada grupo</h2>
    <div class="card">${grupos}
    </div>

    <h2>Campo</h2>
    <div class="card">
      <label>Nombre</label>${inp('campo.nombre', c.campo.nombre)}
      <label>Barras de salida</label>
      <select data-bind="campo.tee" data-rerender="1">${Object.entries(tees).map(([k, t]) => `<option value="${k}" ${k === c.campo.tee ? 'selected' : ''}>${esc(t.nombre)} (CR ${t.cr} / Slope ${t.slope})</option>`).join('')}</select>
      ${c.campo.verificado ? '' : '<div class="banner"><b>Pendiente:</b> confirma el par y el índice de cada hoyo con la tarjeta oficial de Terramar. Los valores de abajo son provisionales.</div>'}
      <label>Par (hoyos 1–18) · total ${pt}</label><div class="mini">${mini('par')}</div>
      <label>Índice / hándicap del hoyo (1 = el más difícil)</label><div class="mini">${mini('si')}</div>
      <label class="check"><input type="checkbox" data-bind="campo.verificado" data-bool="1" ${c.campo.verificado ? 'checked' : ''}> Datos comprobados con la tarjeta oficial</label>
      ${teesHtml}
    </div>

    <h2>Hándicap</h2>
    <div class="card">
      <label class="check"><input type="checkbox" data-bind="handicap.activo" data-bool="1" ${c.handicap.activo ? 'checked' : ''}> Jugar con hándicap</label>
      <div class="fila">
        <div><label>% en individual</label>${inp('handicap.pctIndividual', c.handicap.pctIndividual, 'number')}</div>
        <div><label>% en parejas (mejor y peor bola)</label>${inp('handicap.pctFourball', c.handicap.pctFourball, 'number')}</div>
        <div><label>% en stableford (clasificación individual)</label>${inp('handicap.pctStableford', c.handicap.pctStableford ?? 95, 'number')}</div>
      </div>
      <p class="muted">El jugador con menos hándicap juega a 0 y el otro recibe la diferencia en los hoyos de índice más bajo. En mejor y peor bola, los 4 se comparan con el más bajo del grupo.</p>
    </div>

    <div class="acciones"><button class="btn" data-act="guardar-config">💾 Guardar y publicar</button></div>
    <div class="err" id="ad-err"></div>

    <h2>Zona peligrosa</h2>
    <div class="card">
      <div class="acciones">
        <button class="btn peligro" data-act="borrar-resultados">Borrar todos los resultados</button>
        <button class="btn sec" data-act="descartar">Descartar cambios</button>
        <button class="btn sec" data-act="salir">Salir</button>
      </div>
    </div>
  </div>`;
}

function setPath(obj, path, v) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = v;
}

function validar(c) {
  const ids = c.jugadores.map((j) => j.id);
  const A = c.jugadores.filter((j) => j.equipo === 'A').map((j) => j.id);
  const B = c.jugadores.filter((j) => j.equipo === 'B').map((j) => j.id);
  if (A.length !== B.length) return `Los equipos deben tener los mismos jugadores (ahora ${A.length} y ${B.length}).`;
  if (c.jugadores.some((j) => !String(j.nombre).trim())) return 'Hay jugadores sin nombre.';
  if (c.jugadores.some((j) => !Number.isFinite(Number(j.hi)) || j.hi < -10 || j.hi > 54)) return 'Algún hándicap no es válido (entre -10 y 54).';
  const usados = c.grupos.flatMap((g) => [...g.a, ...g.b]);
  if (new Set(usados).size !== usados.length || usados.length !== ids.length) return 'Cada jugador tiene que estar en un solo grupo.';
  for (const g of c.grupos) {
    if (!g.a.every((id) => A.includes(id)) || !g.b.every((id) => B.includes(id))) return 'Algún grupo tiene jugadores en el equipo equivocado: pulsa "Generar partidos".';
  }
  const si = c.campo.si.map(Number).slice().sort((a, b) => a - b);
  if (si.some((v, i) => v !== i + 1)) return 'Los índices de los hoyos deben ser del 1 al 18 sin repetir.';
  if (c.campo.par.some((p) => p < 3 || p > 6)) return 'Algún par no es válido.';
  return null;
}

function grupoTexto(c, g) {
  const n = nombres(c);
  return `${n[g.a[0]]} + ${n[g.a[1]]} vs ${n[g.b[0]]} + ${n[g.b[1]]}`;
}

// ------------------------------------------------------------------ acciones
async function accion(act, v, el) {
  const r = ruta();
  try {
    switch (act) {
      case 'tab':
        S.tab[r.gid] = v;
        break;
      case 'orden-ind':
        S.ordenInd = v;
        break;
      case 'hoyo':
        S.hoyo[r.gid] = Number(v);
        break;
      case 'mas':
      case 'menos':
      case 'levantar': {
        const gid = r.gid;
        const h = S.hoyo[gid];
        const key = `${gid}:${h}`;
        const actual = S.draft[key]?.[v] ?? S.scores[gid]?.h?.[h]?.[v] ?? null;
        const par = Number(S.cfg.campo.par[h - 1]);
        let nv;
        if (act === 'levantar') nv = actual === LEVANTADA ? null : LEVANTADA;
        else if (actual == null || actual === LEVANTADA) nv = act === 'mas' ? par : par - 1;
        else nv = Math.max(1, Math.min(15, Number(actual) + (act === 'mas' ? 1 : -1)));
        (S.draft[key] ||= {})[v] = nv;
        programarGuardado(gid, h);
        break;
      }
      case 'guardar': {
        const gid = r.gid;
        const h = S.hoyo[gid];
        const key = `${gid}:${h}`;
        if (!S.draft[key]) break;
        await store.apuntar(gid, h, S.draft[key]);
        delete S.draft[key];
        toast(`Hoyo ${h} guardado`);
        const g = S.cfg.grupos.find((x) => x.id === gid);
        const completo = [...g.a, ...g.b].every((id) => S.scores[gid]?.h?.[h]?.[id] != null);
        if (completo && h < HOYOS) S.hoyo[gid] = h + 1;
        break;
      }
      case 'entrar': {
        const pin = document.getElementById('pin').value.trim();
        try {
          await store.entrar(v, pin);
          if (v === 'admin') await cargarPins();
        } catch (e) {
          document.getElementById('pin-err').textContent = e.message;
          return;
        }
        break;
      }
      case 'crear-admin': {
        const pin = document.getElementById('pin-nuevo').value.trim();
        if (!/^\d{4,8}$/.test(pin)) {
          document.getElementById('crear-err').textContent = 'El PIN debe tener entre 4 y 8 cifras.';
          return;
        }
        try {
          await store.crearAdmin(pin);
        } catch {
          document.getElementById('crear-err').textContent = 'Ya existe un PIN de admin: usa "Entrar".';
          return;
        }
        break;
      }
      case 'salir':
        await store.salir();
        S.ad = null;
        break;
      case 'equilibrar': {
        const { A } = equilibrarEquipos(S.ad.jugadores);
        S.ad.jugadores.forEach((j) => (j.equipo = A.includes(j.id) ? 'A' : 'B'));
        regenerar();
        const suma = (eq) => S.ad.jugadores.filter((j) => j.equipo === eq).reduce((s, j) => s + Number(j.hi), 0);
        S.adMsg = `Equipos hechos: suma de hándicaps ${suma('A').toFixed(1)} contra ${suma('B').toFixed(1)}. Partidos regenerados. Recuerda <b>Guardar y publicar</b>.`;
        break;
      }
      case 'generar': {
        const err = regenerar();
        S.adMsg = err || `Partidos nuevos:<br>${S.ad.grupos.map((g, i) => `Grupo ${i + 1}: ${esc(grupoTexto(S.ad, g))}`).join('<br>')}<br>Recuerda <b>Guardar y publicar</b>.`;
        break;
      }
      case 'pins-azar':
        leerPinsDom();
        for (const g of S.ad.grupos) S.pins[g.id] = String(Math.floor(1000 + Math.random() * 9000));
        break;
      case 'historial': {
        const lista = await store.historial(v);
        const n = nombres(S.ad);
        S.historial[v] = lista.length
          ? lista
              .map((l) => `${l.t ? l.t.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''} · hoyo ${l.hoyo}: ${Object.entries(l.valores).map(([id, x]) => `${esc(n[id])} ${x ?? 'borrado'}`).join(', ')}`)
              .join('<br>')
          : 'Sin cambios todavía.';
        break;
      }
      case 'guardar-config': {
        leerPinsDom();
        const err = validar(S.ad);
        const out = document.getElementById('ad-err');
        if (err) {
          out.textContent = err;
          return;
        }
        const cambiaGrupos = S.cfg && JSON.stringify(S.cfg.grupos.map((g) => [g.a, g.b])) !== JSON.stringify(S.ad.grupos.map((g) => [g.a, g.b]));
        const hayResultados = Object.values(S.scores).some((s) => Object.keys(s.h || {}).length);
        if (cambiaGrupos && hayResultados && !confirm('Has cambiado los partidos y ya hay resultados apuntados. ¿Guardar igualmente? (Los golpes apuntados se quedan en cada grupo.)')) return;
        await store.guardarConfig(clone(S.ad));
        S.adMsg = '✅ Guardado y publicado. Todos los móviles ya ven los cambios.';
        break;
      }
      case 'borrar-resultados':
        if (!confirm('¿Seguro? Se borran todos los golpes apuntados de todos los grupos.')) return;
        await store.borrarResultados((S.cfg?.grupos || S.ad.grupos).map((g) => g.id));
        S.adMsg = 'Resultados borrados.';
        break;
      case 'descartar':
        S.ad = null;
        S.adMsg = '';
        await cargarPins();
        break;
    }
  } catch (e) {
    console.error(e);
    toast('Error: ' + (e.message || e));
  }
  render();
  if (['generar', 'equilibrar', 'guardar-config', 'borrar-resultados'].includes(act)) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function regenerar() {
  const c = S.ad;
  const A = c.jugadores.filter((j) => j.equipo === 'A').map((j) => j.id);
  const B = c.jugadores.filter((j) => j.equipo === 'B').map((j) => j.id);
  if (A.length !== B.length || A.length % 2) return 'Los dos equipos deben tener el mismo número de jugadores (par).';
  const hi = Object.fromEntries(c.jugadores.map((j) => [j.id, Number(j.hi)]));
  const { grupos } = generarPartidos(A, B, hi);
  c.grupos = grupos.map((g, i) => ({ ...g, hora: c.grupos[i]?.hora || '' }));
  return null;
}

function leerPinsDom() {
  document.querySelectorAll('[data-pin]').forEach((el) => (S.pins[el.dataset.pin] = el.value.trim()));
}

async function cargarPins() {
  if (S.rol !== 'admin') return;
  const gids = (S.cfg || configInicial()).grupos.map((g) => g.id);
  S.pins = { ...S.pins, ...(await store.pins(gids)) };
}

// ------------------------------------------------------------------ render
function render() {
  const r = ruta();
  colores(r.pag === 'admin' && S.ad ? S.ad : S.cfg);
  let html;
  if (!S.cargado) html = '<div class="wrap"><p>Conectando…</p></div>';
  else if (r.pag === 'grupo') html = vistaGrupo(r.gid);
  else if (r.pag === 'admin') html = vistaAdmin();
  else if (r.pag === 'individual') html = vistaIndividual();
  else html = vistaMarcador();
  const y = window.scrollY;
  $app.innerHTML = cabecera(r) + html;
  window.scrollTo(0, y);
}

$app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  e.preventDefault();
  accion(b.dataset.act, b.dataset.v, b);
});
$app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'pin') accion('entrar', document.querySelector('[data-act=entrar]')?.dataset.v);
});
$app.addEventListener('change', (e) => {
  const el = e.target;
  if (!el.dataset.bind || !S.ad) return;
  let v = el.dataset.bool ? el.checked : el.value;
  if (el.dataset.num) v = v === '' ? 0 : Number(v);
  setPath(S.ad, el.dataset.bind, v);
  if (el.dataset.rerender || el.tagName === 'SELECT' || el.type === 'checkbox') {
    leerPinsDom();
    render();
  }
});
$app.addEventListener('toggle', (e) => {
  const id = e.target.dataset?.ind;
  if (!id) return;
  if (e.target.open) S.abiertos.add(id);
  else S.abiertos.delete(id);
}, true);
window.addEventListener('hashchange', () => {
  S.adMsg = '';
  render();
  window.scrollTo(0, 0);
});

function editandoAdmin() {
  return ruta().pag === 'admin' && S.rol === 'admin';
}
on('config', (cfg) => {
  S.cfg = cfg;
  if (!editandoAdmin()) render();
});
on('scores', (sc) => {
  S.scores = sc;
  if (!editandoAdmin()) render();
});
on('rol', (rol) => {
  S.rol = rol;
});

async function sembrarDemo() {
  // En modo demo, deja el torneo listo para probar.
  if (S.cfg) return;
  try {
    await store.crearAdmin('1234');
  } catch {
    await store.entrar('admin', '1234');
  }
  const cfg = configInicial();
  await Promise.all(cfg.grupos.map((g, i) => store.guardarPin(g.id, String(i + 1).repeat(4))));
  await store.guardarConfig(cfg);
  await store.salir();
}

(async () => {
  try {
    await iniciar();
    if (modoDemo) await sembrarDemo();
    await cargarPins();
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<div class="wrap"><div class="card" style="margin-top:16px"><b>No se ha podido conectar.</b><br>${esc(e.message)}</div></div>`;
    return;
  }
  S.cargado = true;
  render();
})();
