# Ryder Cup Terramar ⛳

Web para seguir en directo una Ryder Cup entre amigos en el Club de Golf Terramar (Sitges).

- **2 equipos de 6** y **3 grupos de 4** (2 contra 2), a 18 hoyos.
- En cada grupo se juegan **a la vez** 3 partidos de match play: uno **por parejas** y **dos individuales**. En el de parejas cada hoyo vale **2 puntos**: uno a la **mejor bola** y otro a la **peor bola** (si ganas los dos, te pones 2 UP en ese hoyo). Cada jugador juega su bola y la web calcula los tres partidos con los mismos golpes.
- **9 puntos en juego** (cada partido vale 1 punto; empate = ½). Gana el primero que llegue a **5**.
- Hándicap opcional: 100 % en los individuales y 90 % en el partido de parejas (se puede cambiar).
- Tiempo real con Firebase Firestore. Si se va la cobertura, los golpes se guardan en el móvil y se suben al volver.

## Pantallas

| Ruta | Qué hay |
|---|---|
| `#/` | Marcador general y los 9 partidos en directo |
| `#/g/g1` (g2, g3) | Apuntar los golpes hoyo a hoyo (con el PIN del grupo) y la tarjeta |
| `#/individual` | Clasificación individual: scratch y stableford, con la tarjeta de cada jugador |
| `#/admin` | Jugadores, hándicaps, equipos igualados, generación de partidos, PINs y datos del campo |

## Probarlo sin Firebase (modo demo)

```bash
cd ryder-cup
python3 -m http.server 8000
```

Abre http://localhost:8000 en dos pestañas. PIN de admin `1234`; grupos `1111`, `2222` y `3333`.

## Ponerlo en marcha de verdad (unos 10 minutos)

1. Entra en https://console.firebase.google.com, crea un proyecto (el plan gratuito Spark es suficiente) y dentro:
   - **Firestore Database** → Crear base de datos (modo producción, región `eur3` o `europe-southwest1`).
   - **Authentication** → Método de acceso → activa **Anónimo**.
   - **Configuración del proyecto** → Tus apps → **Web** (`</>`) → copia el objeto `firebaseConfig` en `js/firebase-config.js`.
2. Publica las reglas de seguridad y la web con Firebase Hosting:
   ```bash
   npm install -g firebase-tools
   firebase login
   cd ryder-cup
   firebase use --add          # elige tu proyecto
   firebase deploy             # sube firestore.rules y la web
   ```
   Te dará una URL del tipo `https://<proyecto>.web.app`. (Si el repositorio es público, también se puede usar GitHub Pages; aun así hay que publicar `firestore.rules` con `firebase deploy --only firestore:rules`.)
3. Abre la web → **Admin** → crea tu PIN de admin (solo se puede hacer una vez; mejor de 6 cifras).
4. Mete los 12 jugadores con su hándicap → **Hacer equipos igualados** (si no tenéis equipos) → **Generar partidos** → **Generar PINs al azar** → **Guardar y publicar**.
5. Pasa a cada grupo su enlace (`.../#/g/g1`) y su PIN.

## Seguridad

- Cualquiera con el enlace puede **ver** el marcador.
- Para **apuntar** hay que meter el PIN del grupo; para configurar, el PIN de admin. Los PINs están en una colección que solo puede leer el admin, y las reglas (`firestore.rules`) los comprueban en el servidor.
- Cada cambio queda registrado (admin → "Ver últimos cambios").

## Campo y clasificación individual

- Datos de la tarjeta oficial de Terramar (2023): par, hándicap de cada hoyo y metros desde amarillas. CR 70,7 / Slope 133 (tabla RFEG del recorrido CB02-6).
- Pestaña **Individual**: golpes scratch de cada jugador (y su diferencia con el par) y puntos stableford con el 95 % del hándicap de campo, que es lo que indica la tabla RFEG para medal/stableford.

## Desarrollo

- `js/golf.js`: lógica pura (hándicaps WHS, match play, puntos).
- `js/pairing.js`: equipos igualados y búsqueda exhaustiva de los partidos más igualados.
- `js/store.js`: Firebase o modo demo, con la misma interfaz.
- `js/app.js`: interfaz (sin frameworks ni compilación).
- Tests: `node --test tests/*.mjs`.
