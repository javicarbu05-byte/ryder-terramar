// Configuración inicial del torneo. Todo se puede cambiar desde la pantalla de admin.

export function configInicial() {
  // Jugadores reales (hándicap exacto).
  const lista = [
    ['Javi', 11.3, 'A'], ['Bel', 13.4, 'B'], ['Pedro', 17, 'B'], ['Figui', 6, 'B'],
    ['Alex', 5, 'A'], ['Nacho B', 30, 'A'], ['Nacho P', 1.5, 'A'], ['Pol', 16, 'B'],
    ['Mauro', 16, 'A'], ['Morillo', 16, 'A'], ['Juanito', 18, 'B'], ['Tomás Rosal', 3.1, 'B'],
  ];
  const jugadores = lista.map(([nombre, hi, equipo], i) => ({ id: `p${i + 1}`, nombre, hi, equipo }));
  return {
    nombre: 'Ryder Cup Terramar',
    fecha: '',
    equipos: {
      A: { nombre: 'Team Europe', color: '#1f4fa8' },
      B: { nombre: 'Team USA', color: '#b4162b' },
    },
    campo: {
      nombre: 'Club de Golf Terramar (Sitges)',
      // Tarjeta oficial del club (2023).
      par: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 5, 5, 3, 4],
      si: [4, 8, 14, 10, 18, 12, 16, 2, 6, 1, 17, 13, 3, 9, 7, 11, 15, 5],
      metros: [364, 331, 148, 460, 285, 311, 166, 371, 467, 331, 144, 316, 388, 340, 465, 436, 153, 384],
      verificado: true,
      tee: 'amarillas',
      // Course rating y slope (tabla RFEG del recorrido CB02-6 Terramar, válida desde 07/09/2021).
      tees: {
        blancas: { nombre: 'Blancas', cr: 72.6, slope: 137 },
        amarillas: { nombre: 'Amarillas', cr: 70.7, slope: 133 },
        azules: { nombre: 'Azules', cr: 68.1, slope: 120 },
        rojas: { nombre: 'Rojas', cr: 66.4, slope: 119 },
      },
    },
    handicap: { activo: true, pctIndividual: 100, pctFourball: 90, pctStableford: 95 },
    jugadores,
    // Equipo 1 y parejas fijados por el usuario; rivales elegidos por la web para igualar.
    grupos: [
      { id: 'g1', hora: '09:57', a: ['p7', 'p6'], b: ['p12', 'p11'] },
      { id: 'g2', hora: '10:15', a: ['p1', 'p5'], b: ['p2', 'p4'] },
      { id: 'g3', hora: '10:24', a: ['p9', 'p10'], b: ['p8', 'p3'] },
    ],
  };
}
