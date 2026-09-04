const bcrypt = require('bcrypt');
const User = require('../models/User');
const { datosPublicos, validarPassword, RONDAS_BCRYPT } = require('./authController');

// Lista blanca. Sin esto, un PUT podría escribir cualquier campo del
// documento (mass assignment), incluidos campos que no existen en el schema.
//
// 'estado' queda fuera a propósito: se cambia solo por PUT /:id/aprobar y
// /:id/rechazar, que además dejan registro de quién lo hizo y cuándo.
const CAMPOS_EDITABLES = ['nombre', 'email', 'rol'];

const ESTADOS = ['pendiente', 'aprobado', 'rechazado'];

// GET /api/usuarios  (admin)
// Acepta ?estado=pendiente para filtrar.
async function listar(req, res) {
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const limite = Math.min(100, Math.max(1, Number(req.query.limite) || 50));

  const filtro = {};
  if (req.query.estado !== undefined) {
    if (!ESTADOS.includes(req.query.estado)) {
      return res.status(400).json({
        error: `Estado no válido. Debe ser uno de: ${ESTADOS.join(', ')}`
      });
    }
    filtro.estado = req.query.estado;
  }

  const [usuarios, total] = await Promise.all([
    // .lean() para que el listado muestre el estado realmente guardado y no
    // el default del schema (ver el comentario en authController.login).
    User.find(filtro)
      .sort({ fechaRegistro: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite)
      .lean(),
    User.countDocuments(filtro)
  ]);

  res.json({
    total,
    pagina,
    paginas: Math.ceil(total / limite) || 1,
    usuarios: usuarios.map(datosPublicos)
  });
}

// PUT /api/usuarios/:id  (admin)
//
// Escribe SOLO los campos enviados, con $set y sin hidratar el documento.
//
// Antes hacía findById + save(), y eso tenía un efecto colateral serio: al
// hidratar un usuario anterior a la aprobación (sin el campo 'estado'),
// Mongoose le aplicaba el default 'pendiente' y save() lo grababa. Cambiarle
// el nombre a alguien bastaba para dejarlo sin poder iniciar sesión.
async function actualizar(req, res) {
  const { id } = req.params;

  const usuario = await User.findById(id).lean();
  if (!usuario) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // Un admin no puede quitarse a sí mismo el rol de admin: si es el único,
  // el sistema quedaría sin nadie capaz de administrarlo.
  if (req.body.rol && req.body.rol !== 'admin' && String(usuario._id) === req.usuario.userId) {
    return res.status(400).json({ error: 'No puedes cambiar tu propio rol de administrador' });
  }

  const cambios = {};

  for (const campo of CAMPOS_EDITABLES) {
    if (req.body[campo] !== undefined) {
      cambios[campo] = campo === 'email'
        ? String(req.body[campo]).toLowerCase().trim()
        : req.body[campo];
    }
  }

  if (req.body.password !== undefined) {
    const errorPassword = validarPassword(req.body.password);
    if (errorPassword) {
      return res.status(400).json({ error: errorPassword });
    }
    cambios.password = await bcrypt.hash(req.body.password, RONDAS_BCRYPT);
  }

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({
      error: `No se envió ningún campo editable (${CAMPOS_EDITABLES.join(', ')}, password)`
    });
  }

  // runValidators aplica enum, match y longitudes igual que en un save().
  // El índice unique del email lo cubre el manejador de errores (11000 → 409).
  const actualizado = await User
    .findByIdAndUpdate(id, { $set: cambios }, { new: true, runValidators: true })
    .lean();

  res.json({
    mensaje: 'Usuario actualizado con éxito',
    usuario: datosPublicos(actualizado)
  });
}

// DELETE /api/usuarios/:id  (admin)
async function eliminar(req, res) {
  const { id } = req.params;

  if (id === req.usuario.userId) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  }

  const usuario = await User.findByIdAndDelete(id);
  if (!usuario) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  res.json({ mensaje: 'Usuario eliminado con éxito' });
}

/* Cambia el estado de una solicitud y deja constancia de quién la resolvió.
   Compartido por aprobar y rechazar. */
async function resolverSolicitud(req, res, nuevoEstado) {
  const { id } = req.params;

  // Un admin que se rechazara a sí mismo se quedaría sin poder entrar, y si
  // fuera el único, nadie podría revertirlo.
  if (id === req.usuario.userId) {
    return res.status(400).json({ error: 'No puedes cambiar el estado de tu propia cuenta' });
  }

  // .lean() + $set, igual que en actualizar: nada de hidratar y volver a
  // guardar el documento entero.
  const usuario = await User.findById(id).lean();
  if (!usuario) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // Una cuenta antigua no tiene 'estado'; el login la trata como aprobada,
  // así que aquí se compara con ese mismo criterio.
  const estadoActual = usuario.estado || 'aprobado';

  if (estadoActual === nuevoEstado) {
    return res.status(409).json({
      error: `Esa cuenta ya está en estado "${nuevoEstado}"`,
      usuario: datosPublicos(usuario)
    });
  }

  const actualizado = await User.findByIdAndUpdate(id, {
    $set: {
      estado: nuevoEstado,
      revisadoPor: req.usuario.userId,
      fechaRevision: new Date()
    }
  }, { new: true, runValidators: true }).lean();

  res.json({
    mensaje: nuevoEstado === 'aprobado'
      ? 'Cuenta aprobada. El usuario ya puede iniciar sesión.'
      : 'Solicitud rechazada. El usuario no podrá iniciar sesión.',
    usuario: datosPublicos(actualizado)
  });
}

// PUT /api/usuarios/:id/aprobar  (admin)
const aprobar = (req, res) => resolverSolicitud(req, res, 'aprobado');

// PUT /api/usuarios/:id/rechazar  (admin)
const rechazar = (req, res) => resolverSolicitud(req, res, 'rechazado');

module.exports = { listar, actualizar, eliminar, aprobar, rechazar, ESTADOS };
