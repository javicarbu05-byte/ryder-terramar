// Generador de equipos y partidos equilibrados (búsqueda exhaustiva: 12 jugadores es poco).

/** Fuerza estimada de una pareja en fourball (pesa más el mejor jugador). */
export function fuerzaPareja(h1, h2) {
  return 0.65 * Math.min(h1, h2) + 0.35 * Math.max(h1, h2);
}

function combinaciones(arr, k) {
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === k) return out.push(acc.slice());
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

/** Todas las formas de dividir una lista (longitud par) en parejas. */
export function emparejamientos(ids) {
  if (ids.length === 0) return [[]];
  const [primero, ...resto] = ids;
  const out = [];
  for (let i = 0; i < resto.length; i++) {
    const pareja = [primero, resto[i]];
    const sobran = resto.filter((_, j) => j !== i);
    for (const r of emparejamientos(sobran)) out.push([pareja, ...r]);
  }
  return out;
}

function permutaciones(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((x, i) => {
    for (const p of permutaciones(arr.filter((_, j) => j !== i))) out.push([x, ...p]);
  });
  return out;
}

/** Elige al azar entre las soluciones casi óptimas, para que "Regenerar" dé alternativas. */
function elegir(soluciones, rnd) {
  soluciones.sort((a, b) => a.coste - b.coste);
  const mejor = soluciones[0].coste;
  const tol = Math.max(0.5, mejor * 0.15);
  const buenas = soluciones.filter((s) => s.coste <= mejor + tol).slice(0, 40);
  return buenas[Math.floor(rnd() * buenas.length)];
}

/**
 * Reparte 12 jugadores en 2 equipos de 6 lo más igualados posible
 * (misma suma de hándicaps y niveles parecidos puesto a puesto).
 * @param {{id:string, hi:number}[]} jugadores
 */
export function equilibrarEquipos(jugadores, rnd = Math.random) {
  const n = jugadores.length;
  if (n % 2) throw new Error('Hace falta un número par de jugadores');
  const ids = jugadores.map((j) => j.id);
  const hi = Object.fromEntries(jugadores.map((j) => [j.id, Number(j.hi)]));
  const sols = [];
  for (const a of combinaciones(ids.slice(1), n / 2 - 1)) {
    const A = [ids[0], ...a];
    const B = ids.filter((id) => !A.includes(id));
    const sA = A.map((id) => hi[id]).sort((x, y) => x - y);
    const sB = B.map((id) => hi[id]).sort((x, y) => x - y);
    const suma = sA.reduce((s, v) => s + v, 0) - sB.reduce((s, v) => s + v, 0);
    const puesto = sA.reduce((s, v, i) => s + (v - sB[i]) ** 2, 0);
    sols.push({ coste: suma * suma + 0.5 * puesto, A, B });
  }
  const s = elegir(sols, rnd);
  // Aleatoriza qué equipo es A para no favorecer siempre al jugador 0.
  return rnd() < 0.5 ? { A: s.A, B: s.B } : { A: s.B, B: s.A };
}

/**
 * Forma 3 grupos (2 vs 2): fourball A1+A2 vs B1+B2 e individuales A1–B1 y A2–B2.
 * Minimiza la diferencia de nivel en los individuales y en los fourball.
 * @returns {{grupos: {id,a:[string,string],b:[string,string]}[], coste:number}}
 */
export function generarPartidos(equipoA, equipoB, hiPorId, rnd = Math.random) {
  const hi = (id) => Number(hiPorId[id] ?? 0);
  const sols = [];
  const parejasA = emparejamientos(equipoA);
  const parejasB = emparejamientos(equipoB);
  for (const pa of parejasA) {
    for (const pb of parejasB) {
      for (const orden of permutaciones([0, 1, 2])) {
        // Para cada grupo, 2 formas de cruzar los individuales.
        for (let mask = 0; mask < 1 << pa.length; mask++) {
          let coste = 0;
          const grupos = pa.map((parA, g) => {
            let parB = pb[orden[g]];
            if (mask & (1 << g)) parB = [parB[1], parB[0]];
            coste += (hi(parA[0]) - hi(parB[0])) ** 2 + (hi(parA[1]) - hi(parB[1])) ** 2;
            coste +=
              2 * (fuerzaPareja(hi(parA[0]), hi(parA[1])) - fuerzaPareja(hi(parB[0]), hi(parB[1]))) ** 2;
            return { a: parA, b: parB };
          });
          sols.push({ coste, grupos });
        }
      }
    }
  }
  const s = elegir(sols, rnd);
  // Salen primero los grupos de mejor nivel.
  const media = (g) => (hi(g.a[0]) + hi(g.a[1]) + hi(g.b[0]) + hi(g.b[1])) / 4;
  const grupos = s.grupos
    .slice()
    .sort((x, y) => media(x) - media(y))
    .map((g, i) => ({ id: `g${i + 1}`, a: g.a, b: g.b }));
  return { grupos, coste: s.coste };
}
