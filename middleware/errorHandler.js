const multer = require('multer');
const { esProduccion, MAX_FILE_SIZE_BYTES } = require('../config/env');

// 404 para rutas no registradas.
function noEncontrado(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// Manejador central. Express 5 reenvía aquí también los errores de los
// controladores async, así que no hace falta try/catch en cada uno.
// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  // Archivo demasiado grande / demasiados campos, etc.
  if (err instanceof multer.MulterError) {
    const mb = Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024);
    const mensajes = {
      LIMIT_FILE_SIZE: `El archivo supera el máximo de ${mb} MB`,
      LIMIT_FILE_COUNT: 'Solo se permite un archivo por subida',
      LIMIT_UNEXPECTED_FILE: 'Campo de archivo inesperado (debe llamarse "file")'
    };
    return res.status(400).json({ error: mensajes[err.code] || 'Error al procesar el archivo' });
  }

  // Tipo de archivo rechazado por el fileFilter.
  if (err.name === 'TipoArchivoNoPermitido') {
    return res.status(415).json({ error: err.message });
  }

  // Validación de Mongoose.
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Datos inválidos',
      detalles: Object.values(err.errors).map(e => e.message)
    });
  }

  // ObjectId con formato incorrecto en la URL.
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(400).json({ error: 'Identificador inválido' });
  }

  // Índice único duplicado (por ejemplo, dos registros con el mismo email
  // enviados a la vez: el unique de Mongo gana la carrera y llega aquí).
  if (err.code === 11000) {
    const campo = Object.keys(err.keyPattern || { valor: 1 })[0];
    return res.status(409).json({ error: `Ya existe un registro con ese ${campo}` });
  }

  // JSON mal formado en el body.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
  }

  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error('❌ Error no controlado:', err);
  }

  res.status(status).json({
    error: status >= 500 && esProduccion
      ? 'Error interno del servidor'   // no filtrar detalles en producción
      : err.message || 'Error interno del servidor'
  });
}

module.exports = { noEncontrado, manejadorErrores };
