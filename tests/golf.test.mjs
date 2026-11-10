import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handicapCampo, handicapJuego, puntosStableford, clasificacion, golpesEnHoyo, relativos, estadoPartido, puntos, calcularTorneo, fmtPts,
} from '../js/golf.js';
import { equilibrarEquipos, generarPartidos, emparejamientos } from '../js/pairing.js';
import { configInicial } from '../js/defaults.js';

const SI = Array.from({ length: 18 }, (_, i) => i + 1);
const sc = (filas) => Object.fromEntries(filas.map((f, i) => [String(i + 1), f]));

test('hándicap de campo WHS', () => {
  assert.equal(handicapCampo(10, { slope: 113, cr: 72 }, 72), 10);
  assert.equal(handicapCampo(18, { slope: 137, cr: 72.6 }, 72), 22); // 21.82 + 0.6
});

test('golpes por hoyo', () => {
  assert.equal(golpesEnHoyo(0, 1), 0);
  assert.equal(golpesEnHoyo(5, 5), 1);
  assert.equal(golpesEnHoyo(5, 6), 0);
  assert.equal(golpesEnHoyo(20, 2), 2);
  assert.equal(golpesEnHoyo(20, 3), 1);
});

test('hándicaps relativos', () => {
  assert.deepEqual(relativos({ a: 10, b: 20 }, 100), { a: 0, b: 10 });
  assert.deepEqual(relativos({ a: 10, b: 20, c: 5, d: 0 }, 90), { a: 9, b: 18, c: 5, d: 0 });
});

test('individual: cierre 3&2', () => {
  // A gana los hoyos 1-5, luego empates hasta el 16 -> 5 arriba con 2 por jugar tras el 16? cierra antes
  const filas = [];
  for (let h = 1; h <= 18; h++) filas.push(h <= 3 ? { a: 4, b: 5 } : { a: 4, b: 4 });
  const e = estadoPartido([['a'], ['b']], sc(filas), {}, SI);
  assert.equal(e.final, true);
  assert.equal(e.ganador, 'A');
  assert.equal(e.texto, '3&2');
  assert.equal(e.hoyos[17].muerto, true);
});

test('individual en curso, dormie y AS', () => {
  const filas = [{ a: 4, b: 5 }, { a: 5, b: 4 }];
  const e = estadoPartido([['a'], ['b']], sc(filas), {}, SI);
  assert.equal(e.texto, 'AS');
  assert.equal(e.jugados, 2);
  assert.deepEqual(puntos(e).proy, [0.5, 0.5]);
  assert.deepEqual(puntos(e).conf, [0, 0]);
});

test('hándicap da el hoyo', () => {
  // b recibe 1 golpe en el hoyo de índice 1: 5 neto 4 empata con 4
  const e = estadoPartido([['a'], ['b']], sc([{ a: 4, b: 5 }]), { a: 0, b: 1 }, SI);
  assert.equal(e.hoyos[0].r, '=');
});

test('fourball: mejor bola y bola levantada', () => {
  const filas = [{ a1: 6, a2: 'X', b1: 5, b2: 7 }, { a1: 3, a2: 5, b1: 4, b2: 4 }];
  const e = estadoPartido([['a1', 'a2'], ['b1', 'b2']], sc(filas), {}, SI);
  assert.equal(e.hoyos[0].r, 'B');
  assert.equal(e.hoyos[1].r, 'A');
  assert.equal(e.texto, 'AS');
  // Hoyo incompleto no cuenta
  const e2 = estadoPartido([['a1', 'a2'], ['b1', 'b2']], sc([{ a1: 4, a2: 4, b1: 4 }]), {}, SI);
  assert.equal(e2.jugados, 0);
});

test('final 1 UP en el 18', () => {
  const filas = [];
  for (let h = 1; h <= 18; h++) filas.push(h === 18 ? { a: 3, b: 4 } : { a: 4, b: 4 });
  const e = estadoPartido([['a'], ['b']], sc(filas), {}, SI);
  assert.equal(e.final, true);
  assert.equal(e.texto, '1 UP');
});

test('torneo completo: 9 partidos y objetivo 5', () => {
  const cfg = configInicial();
  const t = calcularTorneo(cfg, {});
  assert.equal(t.enJuego, 9);
  assert.equal(t.objetivo, 5);
  assert.equal(fmtPts(4.5), '4½');
  assert.equal(fmtPts(0.5), '½');
});

test('emparejamientos de 6 = 15', () => {
  assert.equal(emparejamientos(['a', 'b', 'c', 'd', 'e', 'f']).length, 15);
});

test('equipos equilibrados y partidos válidos', () => {
  const jug = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24].map((hi, i) => ({ id: `p${i}`, hi }));
  const { A, B } = equilibrarEquipos(jug, () => 0);
  assert.equal(A.length, 6);
  const hi = Object.fromEntries(jug.map((j) => [j.id, j.hi]));
  const suma = (e) => e.reduce((s, id) => s + hi[id], 0);
  assert.ok(Math.abs(suma(A) - suma(B)) <= 2);
  const { grupos } = generarPartidos(A, B, hi, () => 0);
  assert.equal(grupos.length, 3);
  const usados = grupos.flatMap((g) => [...g.a, ...g.b]).sort();
  assert.deepEqual(usados, jug.map((j) => j.id).sort());
  for (const g of grupos) {
    assert.ok(g.a.every((id) => A.includes(id)));
    assert.ok(g.b.every((id) => B.includes(id)));
    assert.ok(Math.abs(hi[g.a[0]] - hi[g.b[0]]) <= 6);
  }
});

test('hándicap de juego como la tabla RFEG (amarillas Terramar)', () => {
  const am = { cr: 70.7, slope: 133 };
  assert.equal(handicapCampo(10.5, am, 72), 11); // tabla: 10,1–10,8 -> 11 al 100 %
  assert.equal(handicapJuego(11.3, am, 72, 95), 11); // tabla: 10,5–11,3 -> 11 al 95 %
  assert.equal(handicapJuego(11.4, am, 72, 95), 12);
  assert.equal(handicapJuego(30, am, 72, 95), 32); // tabla: 29,3–30,1 -> 32
});

test('stableford', () => {
  assert.equal(puntosStableford(4, 4, 0), 2);
  assert.equal(puntosStableford(3, 4, 0), 3);
  assert.equal(puntosStableford(5, 4, 1), 2);
  assert.equal(puntosStableford(8, 4, 0), 0);
  assert.equal(puntosStableford('X', 4, 2), 0);
  assert.equal(puntosStableford(null, 4, 0), null);
});

test('clasificación individual', () => {
  const cfg = configInicial();
  const g = cfg.grupos[0];
  const sc = { [g.id]: { h: { 1: { [g.a[0]]: 4, [g.a[1]]: 'X' }, 2: { [g.a[0]]: 3 } } } };
  const c = clasificacion(cfg, sc);
  assert.equal(c.length, 12);
  const a0 = c.find((j) => j.id === g.a[0]);
  assert.equal(a0.bruto, 7);
  assert.equal(a0.jugados, 2);
  assert.equal(a0.vsPar, -1);
  const a1 = c.find((j) => j.id === g.a[1]);
  assert.equal(a1.levantadas, 1);
  assert.equal(a1.puntos, 0);
});

test('parejas: mejor + peor bola, 2 puntos por hoyo', () => {
  const L = [['a1', 'a2'], ['b1', 'b2']];
  // Hoyo 1: A gana mejor (3<4) y peor (5<6) -> 2 UP. Hoyo 2: A mejor (3<4), B peor (5<6) -> se queda 2 UP.
  const filas = [{ a1: 3, a2: 5, b1: 4, b2: 6 }, { a1: 3, a2: 6, b1: 4, b2: 5 }];
  const e = estadoPartido(L, sc(filas), {}, SI, 'mejorpeor');
  assert.equal(e.hoyos[0].d, 2);
  assert.equal(e.hoyos[1].d, 0);
  assert.equal(e.texto, '2 UP');
  // Bola levantada pierde la peor bola
  const e2 = estadoPartido(L, sc([{ a1: 4, a2: 'X', b1: 4, b2: 6 }]), {}, SI, 'mejorpeor');
  assert.equal(e2.hoyos[0].d, -1);
  // Cierre: 2 puntos por hoyo -> con 1 hoyo por jugar hace falta ir más de 2 arriba
  const f = [];
  for (let h = 1; h <= 17; h++) f.push(h <= 2 ? { a1: 3, a2: 4, b1: 4, b2: 5 } : { a1: 4, a2: 4, b1: 4, b2: 4 });
  const e3 = estadoPartido(L, sc(f), {}, SI, 'mejorpeor');
  assert.equal(e3.dif, 4);
  assert.equal(e3.final, true);
  assert.equal(e3.texto, '4&1');
  const f2 = f.slice(0, 16);
  f2[1] = { a1: 4, a2: 4, b1: 4, b2: 4 };
  const e4 = estadoPartido(L, sc(f2), {}, SI, 'mejorpeor');
  assert.equal(e4.dif, 2);
  assert.equal(e4.final, false);
});
