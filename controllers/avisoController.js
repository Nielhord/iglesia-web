const Aviso = require('../models/Aviso');
const { CATEGORIAS, ERROR_CATEGORIA } = require('../config/categorias');

const AUTOR = 'nombre rol';
const EDITABLES = ['titulo', 'cuerpo', 'categoria', 'fijado'];
const TOPE = 100;

// GET /api/avisos?categoria=Coro
async function listar(req, res) {
  const { categoria } = req.query;

  if (categoria && !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: ERROR_CATEGORIA });
  }

  const avisos = await Aviso.find(categoria ? { categoria } : {})
    .populate('creadoPor', AUTOR)
    // Los fijados arriba; dentro de cada grupo, lo más nuevo primero.
    .sort({ fijado: -1, creadoEn: -1 })
    .limit(TOPE);

  res.json({ total: avisos.length, avisos });
}

// POST /api/avisos  (editor/admin)
async function crear(req, res) {
  const datos = { creadoPor: req.usuario.userId };

  for (const campo of EDITABLES) {
    if (req.body[campo] !== undefined) datos[campo] = req.body[campo];
  }

  const aviso = await Aviso.create(datos);
  await aviso.populate('creadoPor', AUTOR);

  res.status(201).json({ mensaje: 'Aviso publicado', aviso });
}

// PUT /api/avisos/:id  (editor/admin)
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

  cambios.actualizadoEn = new Date();

  const aviso = await Aviso.findByIdAndUpdate(
    req.params.id, { $set: cambios }, { new: true, runValidators: true }
  ).populate('creadoPor', AUTOR);

  if (!aviso) {
    return res.status(404).json({ error: 'Aviso no encontrado' });
  }

  res.json({ mensaje: 'Aviso actualizado', aviso });
}

// DELETE /api/avisos/:id  (editor/admin)
async function eliminar(req, res) {
  const aviso = await Aviso.findByIdAndDelete(req.params.id);

  if (!aviso) {
    return res.status(404).json({ error: 'Aviso no encontrado' });
  }

  res.json({ mensaje: 'Aviso eliminado' });
}

module.exports = { listar, crear, actualizar, eliminar };
