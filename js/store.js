// Capa de datos: Firebase (tiempo real) o modo demo (localStorage + BroadcastChannel).
// Misma interfaz en los dos casos.
import { firebaseConfig } from './firebase-config.js?v=202611101302';

const V = '10.12.2';
const listeners = { config: new Set(), scores: new Set(), rol: new Set() };
const emit = (k, v) => listeners[k].forEach((cb) => cb(v));

export const modoDemo = !firebaseConfig.apiKey;
let impl;

export function on(evento, cb) {
  listeners[evento].add(cb);
  return () => listeners[evento].delete(cb);
}

export async function iniciar() {
  impl = modoDemo ? crearDemo() : await crearFirebase();
  await impl.iniciar();
}

export const store = new Proxy({}, { get: (_, k) => (...a) => impl[k](...a) });

// ---------------------------------------------------------------- Firebase
async function crearFirebase() {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  // Caché local persistente: si se va la cobertura en el campo, los golpes se guardan
  // en el móvil y se suben solos al volver la conexión.
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  const auth = au.getAuth(app);
  const d = (...p) => fs.doc(db, ...p);
  let uid = null;
  let rol = null;

  async function leerRol() {
    if (!uid) return null;
    try {
      const s = await fs.getDoc(d('accesos', uid));
      return s.exists() ? s.data().rol : null;
    } catch {
      return null;
    }
  }

  return {
    async iniciar() {
      await new Promise((res, rej) => {
        au.onAuthStateChanged(auth, async (u) => {
          if (!u) {
            try {
              await au.signInAnonymously(auth);
            } catch (e) {
              rej(new Error('No se ha podido entrar en Firebase. ¿Está activado el acceso "Anónimo" en Authentication? (' + (e.code || e.message) + ')'));
            }
            return;
          }
          uid = u.uid;
          rol = await leerRol();
          emit('rol', rol);
          res();
        });
      });
      await new Promise((res) => {
        fs.onSnapshot(
          d('torneo', 'config'),
          (s) => {
            emit('config', s.exists() ? s.data() : null);
            res();
          },
          (e) => {
            console.error(e);
            res();
          },
        );
      });
      fs.onSnapshot(fs.collection(db, 'scores'), (qs) => {
        const out = {};
        qs.forEach((s) => (out[s.id] = s.data()));
        emit('scores', out);
      });
    },
    rol: () => rol,
    async crearAdmin(pin) {
      await fs.setDoc(d('secretos', 'admin'), { pin });
      return this.entrar('admin', pin);
    },
    async entrar(r, pin) {
      try {
        await fs.setDoc(d('accesos', uid), { rol: r, pin });
      } catch {
        throw new Error('PIN incorrecto');
      }
      rol = r;
      emit('rol', rol);
    },
    async salir() {
      await fs.deleteDoc(d('accesos', uid)).catch(() => {});
      rol = null;
      emit('rol', rol);
    },
    guardarConfig: (cfg) => fs.setDoc(d('torneo', 'config'), cfg),
    async apuntar(gid, hoyo, valores) {
      // valores: { idJugador: golpes | 'X' | null }
      const h = {};
      for (const [pid, v] of Object.entries(valores)) h[pid] = v === null ? fs.deleteField() : v;
      await fs.setDoc(
        d('scores', gid),
        { h: { [hoyo]: h }, actualizado: fs.serverTimestamp() },
        { merge: true },
      );
      fs.addDoc(fs.collection(db, 'scores', gid, 'log'), {
        hoyo, valores, uid, t: fs.serverTimestamp(),
      }).catch(() => {});
    },
    async historial(gid) {
      const q = fs.query(fs.collection(db, 'scores', gid, 'log'), fs.orderBy('t', 'desc'), fs.limit(15));
      const qs = await fs.getDocs(q);
      return qs.docs.map((s) => ({ ...s.data(), t: s.data().t?.toDate?.() }));
    },
    async borrarResultados(gids) {
      await Promise.all(gids.map((g) => fs.deleteDoc(d('scores', g))));
    },
    async pins(gids) {
      const out = {};
      await Promise.all(
        gids.map(async (g) => {
          const s = await fs.getDoc(d('secretos', g));
          out[g] = s.exists() ? s.data().pin : '';
        }),
      );
      return out;
    },
    guardarPin: (gid, pin) => fs.setDoc(d('secretos', gid), { pin }),
  };
}

// ---------------------------------------------------------------- Demo
function crearDemo() {
  const K = 'ryder-demo-v5';
  let canal = null;
  try { canal = new BroadcastChannel(K); } catch {}
  const leer = () => {
    try {
      return JSON.parse(localStorage.getItem(K)) || {};
    } catch {
      return {};
    }
  };
  let db = leer();
  const ses = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
    del: (k) => { try { sessionStorage.removeItem(k); } catch {} },
  };
  let rol = ses.get(K + '-rol');
  const guardar = () => {
    try {
      localStorage.setItem(K, JSON.stringify(db));
    } catch {}
    canal?.postMessage('cambio');
    publicar();
  };
  const publicar = () => {
    emit('config', db.config || null);
    emit('scores', db.scores || {});
  };
  const recargar = () => {
    db = leer();
    publicar();
  };
  canal && (canal.onmessage = recargar);
  window.addEventListener('storage', (e) => e.key === K && recargar());
  return {
    async iniciar() {
      db.secretos ||= {};
      db.scores ||= {};
      emit('rol', rol);
      publicar();
    },
    rol: () => rol,
    async crearAdmin(pin) {
      if (db.secretos.admin) throw new Error('Ya existe un PIN de admin');
      db.secretos.admin = pin;
      guardar();
      return this.entrar('admin', pin);
    },
    async entrar(r, pin) {
      if (!db.secretos[r] || db.secretos[r] !== pin) throw new Error('PIN incorrecto');
      rol = r;
      ses.set(K + '-rol', r);
      emit('rol', rol);
    },
    async salir() {
      rol = null;
      ses.del(K + '-rol');
      emit('rol', rol);
    },
    async guardarConfig(cfg) {
      db.config = structuredClone(cfg);
      guardar();
    },
    async apuntar(gid, hoyo, valores) {
      const g = (db.scores[gid] ||= { h: {} });
      const h = (g.h[hoyo] ||= {});
      for (const [pid, v] of Object.entries(valores)) {
        if (v === null) delete h[pid];
        else h[pid] = v;
      }
      (db.log ||= []).unshift({ gid, hoyo, valores, t: new Date().toISOString() });
      db.log = db.log.slice(0, 200);
      guardar();
    },
    async historial(gid) {
      return (db.log || []).filter((l) => l.gid === gid).slice(0, 15).map((l) => ({ ...l, t: new Date(l.t) }));
    },
    async borrarResultados(gids) {
      gids.forEach((g) => delete db.scores[g]);
      guardar();
    },
    async pins(gids) {
      return Object.fromEntries(gids.map((g) => [g, db.secretos[g] || '']));
    },
    async guardarPin(gid, pin) {
      db.secretos[gid] = pin;
      guardar();
    },
  };
}
