// Lógica de golf pura (sin DOM ni Firebase): hándicaps, match play y puntos.
// Se puede probar con Node: `node --test tests/`.

export const HOYOS = 18;
export const LEVANTADA = 'X'; // bola levantada: pierde el hoyo en su individual

/** Hándicap de campo sin redondear (WHS): HI × Slope/113 + (CR − Par). */
export function handicapExacto(hi, tee, parTotal) {
  return Number(hi) * (tee.slope / 113) + (tee.cr - parTotal);
}

/** Hándicap de campo (WHS), redondeado. */
export function handicapCampo(hi, tee, parTotal) {
  return Math.round(handicapExacto(hi, tee, parTotal));
}

/** Hándicap de juego con un % de concesión (se aplica sobre el valor sin redondear, como la RFEG). */
export function handicapJuego(hi, tee, parTotal, pct) {
  return Math.round((handicapExacto(hi, tee, parTotal) * pct) / 100);
}

/** Puntos stableford de un hoyo (null si no está apuntado; bola levantada = 0). */
export function puntosStableford(golpes, par, recibe) {
  const v = valor(golpes);
  if (v === null) return null;
  if (v === Infinity) return 0;
  return Math.max(0, 2 + Number(par) + recibe - v);
}

/** Golpes que recibe un jugador en un hoyo según su hándicap de juego y el índice (1..18). */
export function golpesEnHoyo(hj, si) {
  if (hj <= 0) return 0;
  const base = Math.floor(hj / HOYOS);
  return base + (si <= hj % HOYOS ? 1 : 0);
}

/**
 * Hándicaps de juego relativos para un partido: el más bajo juega a 0 y
 * el resto recibe la diferencia (sobre el % indicado del hándicap de campo).
 * @param {Object<string,number>} campos id -> hándicap de campo
 */
export function relativos(campos, pct) {
  const juego = {};
  for (const [id, ch] of Object.entries(campos)) juego[id] = Math.round((ch * pct) / 100);
  const min = Math.min(...Object.values(juego));
  const out = {};
  for (const [id, v] of Object.entries(juego)) out[id] = v - min;
  return out;
}

function valor(g) {
  if (g === LEVANTADA) return Infinity;
  const n = Number(g);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Resultado neto de un hoyo para un jugador (null si no está apuntado). */
function neto(golpes, hj, si) {
  const v = valor(golpes);
  if (v === null) return null;
  return v - golpesEnHoyo(hj, si);
}

/**
 * Estado de un partido de match play.
 * @param {string[][]} lados [[ids lado A], [ids lado B]] (1 o 2 jugadores por lado)
 * @param {Object} scores  { '1': {id: golpes}, ... }
 * @param {Object<string,number>} hj hándicap de juego relativo por jugador
 * @param {number[]} si índice de cada hoyo (array de 18)
 */
export function estadoPartido(lados, scores, hj, si, modo = 'mejor') {
  const hoyos = [];
  let dif = 0;
  let jugados = 0;
  let cerrado = null; // {ganador, texto, hoyo}
  for (let h = 1; h <= HOYOS; h++) {
    const s = scores?.[h] || {};
    const mejor = lados.map((ids) => {
      const netos = ids.map((id) => neto(s[id], hj[id] || 0, si[h - 1]));
      if (netos.some((n) => n === null)) return null; // falta alguien del lado
      // Mejor bola: cuenta el mejor neto de la pareja. Peor bola: el peor.
      return modo === 'peor' ? Math.max(...netos) : Math.min(...netos);
    });
    if (mejor[0] === null || mejor[1] === null) {
      hoyos.push(null);
      continue;
    }
    let r = '=';
    if (mejor[0] < mejor[1]) r = 'A';
    else if (mejor[1] < mejor[0]) r = 'B';
    // Si ambos lados levantaron, se empata el hoyo.
    if (mejor[0] === Infinity && mejor[1] === Infinity) r = '=';
    hoyos.push(cerrado ? { r, muerto: true } : { r });
    if (cerrado) continue;
    jugados++;
    if (r === 'A') dif++;
    if (r === 'B') dif--;
    const quedan = HOYOS - jugados;
    if (Math.abs(dif) > quedan) {
      cerrado = {
        ganador: dif > 0 ? 'A' : 'B',
        texto: quedan === 0 ? `${Math.abs(dif)} UP` : `${Math.abs(dif)}&${quedan}`,
        hoyo: h,
      };
    }
  }
  const quedan = HOYOS - jugados;
  let final = false;
  let ganador = null;
  let texto;
  if (cerrado) {
    final = true;
    ganador = cerrado.ganador;
    texto = cerrado.texto;
  } else if (quedan === 0) {
    final = true;
    ganador = dif === 0 ? '=' : dif > 0 ? 'A' : 'B';
    texto = dif === 0 ? 'AS' : `${Math.abs(dif)} UP`;
  } else if (jugados === 0) {
    texto = '—';
  } else {
    texto = dif === 0 ? 'AS' : `${Math.abs(dif)} UP`;
  }
  const lider = dif === 0 ? '=' : dif > 0 ? 'A' : 'B';
  const dormie = !final && jugados > 0 && Math.abs(dif) === quedan && dif !== 0;
  return { hoyos, dif, jugados, quedan, final, ganador, lider, texto, dormie };
}

/** Puntos de un partido: confirmados (si ha terminado) y proyectados (si acabase ahora). */
export function puntos(estado) {
  const p = (g) => (g === 'A' ? [1, 0] : g === 'B' ? [0, 1] : [0.5, 0.5]);
  const proy = estado.jugados === 0 ? [0, 0] : p(estado.final ? estado.ganador : estado.lider);
  const conf = estado.final ? p(estado.ganador) : [0, 0];
  return { conf, proy };
}

export function parTotal(pares) {
  return pares.reduce((a, b) => a + Number(b), 0);
}

/**
 * Construye los 4 partidos de un grupo (mejor bola, peor bola y 2 individuales) con sus hándicaps.
 * grupo: { id, a: [a1, a2], b: [b1, b2] }
 */
export function teeDe(campo) {
  return campo.tees[campo.tee] || Object.values(campo.tees)[0];
}

export function partidosDeGrupo(grupo, cfg) {
  const { campo, handicap } = cfg;
  const tee = teeDe(campo);
  const ptotal = parTotal(campo.par);
  const jug = Object.fromEntries(cfg.jugadores.map((j) => [j.id, j]));
  const ch = (id) => (handicap.activo ? handicapExacto(jug[id]?.hi ?? 0, tee, ptotal) : 0);
  const [a1, a2] = grupo.a;
  const [b1, b2] = grupo.b;
  const todos = [a1, a2, b1, b2];
  const camposFb = Object.fromEntries(todos.map((id) => [id, ch(id)]));
  const hjParejas = relativos(camposFb, handicap.pctFourball);
  return [
    { id: `${grupo.id}-fb`, tipo: 'Mejor bola', modo: 'mejor', lados: [[a1, a2], [b1, b2]], hj: hjParejas },
    { id: `${grupo.id}-pb`, tipo: 'Peor bola', modo: 'peor', lados: [[a1, a2], [b1, b2]], hj: hjParejas },
    {
      id: `${grupo.id}-i1`,
      tipo: 'Individual',
      lados: [[a1], [b1]],
      hj: relativos({ [a1]: ch(a1), [b1]: ch(b1) }, handicap.pctIndividual),
    },
    {
      id: `${grupo.id}-i2`,
      tipo: 'Individual',
      lados: [[a2], [b2]],
      hj: relativos({ [a2]: ch(a2), [b2]: ch(b2) }, handicap.pctIndividual),
    },
  ];
}

/** Calcula todo el torneo: partidos con estado y marcador total. */
export function calcularTorneo(cfg, scoresPorGrupo) {
  const total = { conf: [0, 0], proy: [0, 0] };
  const grupos = (cfg.grupos || []).map((g) => {
    const scores = scoresPorGrupo[g.id]?.h || {};
    const partidos = partidosDeGrupo(g, cfg).map((p) => {
      const estado = estadoPartido(p.lados, scores, p.hj, cfg.campo.si, p.modo);
      const pts = puntos(estado);
      for (const k of ['conf', 'proy']) {
        total[k][0] += pts[k][0];
        total[k][1] += pts[k][1];
      }
      return { ...p, estado, pts };
    });
    return { ...g, scores, partidos };
  });
  const enJuego = grupos.reduce((n, g) => n + g.partidos.length, 0);
  const objetivo = enJuego / 2 + 0.5; // 12 partidos -> 6½ puntos
  return { grupos, total, enJuego, objetivo };
}

/** Texto de puntos con ½. */
export function fmtPts(n) {
  const e = Math.floor(n);
  const m = n - e >= 0.5;
  if (e === 0 && m) return '½';
  return `${e}${m ? '½' : ''}`;
}

/**
 * Resultado individual de cada jugador: golpes scratch y puntos stableford (con su
 * hándicap de juego al % de stableford, por defecto 95 %), aunque se juegue sin hándicap en los partidos.
 */
export function clasificacion(cfg, scoresPorGrupo) {
  const { campo } = cfg;
  const tee = teeDe(campo);
  const ptotal = parTotal(campo.par);
  const pct = cfg.handicap.pctStableford ?? 95;
  const grupoDe = {};
  for (const g of cfg.grupos || []) for (const id of [...g.a, ...g.b]) grupoDe[id] = g.id;
  return cfg.jugadores
    .filter((j) => grupoDe[j.id])
    .map((j) => {
      const sc = scoresPorGrupo[grupoDe[j.id]]?.h || {};
      const hj = handicapJuego(j.hi, tee, ptotal, pct);
      let bruto = 0, parJugado = 0, jugados = 0, levantadas = 0, puntos = 0;
      const hoyos = [];
      for (let h = 1; h <= HOYOS; h++) {
        const g = sc[h]?.[j.id] ?? null;
        const rec = golpesEnHoyo(hj, campo.si[h - 1]);
        const pts = puntosStableford(g, campo.par[h - 1], rec);
        hoyos.push({ g, rec, pts });
        if (g === null) continue;
        jugados++;
        puntos += pts;
        if (g === LEVANTADA) levantadas++;
        else {
          bruto += Number(g);
          parJugado += Number(campo.par[h - 1]);
        }
      }
      return { ...j, grupo: grupoDe[j.id], hj, hoyos, bruto, vsPar: bruto - parJugado, jugados, levantadas, puntos };
    });
}
