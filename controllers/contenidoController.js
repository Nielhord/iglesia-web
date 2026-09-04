const Contenido = require('../models/Contenido');
const { CONTENIDOS, CLAVES, porDefecto } = require('../config/contenido');

// GET /api/contenido
// Devuelve siempre las mismas claves: las guardadas y, para el resto, su
// texto por defecto. El frontend no tiene que saber cuáles existen ya.
async function listar(req, res) {
  const guardados = await Contenido.find().lean();

  const contenido = porDefecto();
  const editado = {};

  for (const fila of guardados) {
    if (!CLAVES.includes(fila.clave)) continue;   // clave retirada del código
    contenido[fila.clave] = fila.valor;
    editado[fila.clave] = fila.actualizadoEn;
  }

  res.json({ contenido, editado });
}

// PUT /api/contenido/:clave  (editor/admin)
async function actualizar(req, res) {
  const { clave } = req.params;
  const definicion = CONTENIDOS[clave];

  if (!definicion) {
    return res.status(404).json({
      error: `Contenido desconocido. Opciones: ${CLAVES.join(', ')}`
    });
  }

  const valor = typeof req.body.valor === 'string' ? req.body.valor.trim() : '';

  if (!valor) {
    return res.status(400).json({ error: `"${definicion.etiqueta}" no puede quedar vacío` });
  }

  if (valor.length > definicion.maximo) {
    return res.status(400).json({
      error: `"${definicion.etiqueta}" no puede superar los ${definicion.maximo} caracteres`
    });
  }

  // upsert: la primera vez que se edita, la fila todavía no existe.
  const fila = await Contenido.findOneAndUpdate(
    { clave },
    { $set: { valor, actualizadoPor: req.usuario.userId, actualizadoEn: new Date() } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  res.json({ mensaje: 'Contenido actualizado', clave, valor: fila.valor });
}

module.exports = { listar, actualizar };
