const Actividad = require('../models/Actividad');
const { CATEGORIAS, ERROR_CATEGORIA } = require('../config/categorias');

const AUTOR = 'nombre rol';
const EDITABLES = ['titulo', 'descripcion', 'categoria', 'fecha', 'hora', 'lugar'];
const TOPE = 300;

// La fecha de una actividad es un DÍA del calendario, no un instante. Se
// guarda y se compara siempre en UTC (que es como Mongoose interpreta un
// 'YYYY-MM-DD' suelto) y el frontend la lee con .slice(0, 10). Así el día 1
// es el día 1 en Talca, en el servidor y en la base, sin sorpresas de huso.
function comoDiaUTC(texto, finDelDia = false) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ''));
  if (!partes) return null;
  const [, a, m, d] = partes;
  return new Date(finDelDia
    ? Date.UTC(+a, +m - 1, +d, 23, 59, 59, 999)
    : Date.UTC(+a, +m - 1, +d));
}

// GET /api/actividades?categoria=Coro&desde=2026-09-01&hasta=2026-09-30
async function listar(req, res) {
  const { categoria, desde, hasta } = req.query;

  if (categoria && !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: ERROR_CATEGORIA });
  }

  const filtro = {};
  if (categoria) filtro.categoria = categoria;

  const inicio = comoDiaUTC(desde);
  const fin = comoDiaUTC(hasta, true);

  if ((desde && !inicio) || (hasta && !fin)) {
    return res.status(400).json({ error: 'Las fechas deben tener el formato YYYY-MM-DD' });
  }
  if (inicio || fin) {
    filtro.fecha = {};
    if (inicio) filtro.fecha.$gte = inicio;
    if (fin) filtro.fecha.$lte = fin;
  }

  const actividades = await Actividad.find(filtro)
    .populate('creadoPor', AUTOR)
    .sort({ fecha: 1, hora: 1 })
    .limit(TOPE);

  res.json({ total: actividades.length, actividades });
}

// POST /api/actividades  (editor/admin)
async function crear(req, res) {
  const datos = { creadoPor: req.usuario.userId };

  for (const campo of EDITABLES) {
    if (req.body[campo] !== undefined) datos[campo] = req.body[campo];
  }

  const actividad = await Actividad.create(datos);
  await actividad.populate('creadoPor', AUTOR);

  res.status(201).json({ mensaje: 'Actividad creada', actividad });
}

// PUT /api/actividades/:id  (editor/admin)
async function actualizar(req, res) {
  const cambios = {};
  for (const campo of EDITABLES) {
    if (req.body[campo] !== undefined) cambios[campo] = req.body[campo];
  }

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({
      error: `No se envió ningún campo editable (${EDITABLES.join(', ')})`
    });
  }

  const actividad = await Actividad.findByIdAndUpdate(
    req.params.id, { $set: cambios }, { new: true, runValidators: true }
  ).populate('creadoPor', AUTOR);

  if (!actividad) {
    return res.status(404).json({ error: 'Actividad no encontrada' });
  }

  res.json({ mensaje: 'Actividad actualizada', actividad });
}

// DELETE /api/actividades/:id  (editor/admin)
async function eliminar(req, res) {
  const actividad = await Actividad.findByIdAndDelete(req.params.id);

  if (!actividad) {
    return res.status(404).json({ error: 'Actividad no encontrada' });
  }

  res.json({ mensaje: 'Actividad eliminada' });
}

module.exports = { listar, crear, actualizar, eliminar };
