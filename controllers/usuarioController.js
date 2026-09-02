const bcrypt = require('bcrypt');
const User = require('../models/User');
const { datosPublicos, validarPassword, RONDAS_BCRYPT } = require('./authController');

// Lista blanca. Sin esto, un PUT podría escribir cualquier campo del
// documento (mass assignment), incluidos campos que no existen en el schema.
const CAMPOS_EDITABLES = ['nombre', 'email', 'rol'];

// GET /api/usuarios  (admin)
async function listar(req, res) {
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const limite = Math.min(100, Math.max(1, Number(req.query.limite) || 50));

  const [usuarios, total] = await Promise.all([
    User.find()
      .sort({ fechaRegistro: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite),
    User.countDocuments()
  ]);

  res.json({
    total,
    pagina,
    paginas: Math.ceil(total / limite) || 1,
    usuarios: usuarios.map(datosPublicos)
  });
}

// PUT /api/usuarios/:id  (admin)
async function actualizar(req, res) {
  const { id } = req.params;

  const usuario = await User.findById(id);
  if (!usuario) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // Un admin no puede quitarse a sí mismo el rol de admin: si es el único,
  // el sistema quedaría sin nadie capaz de administrarlo.
  if (req.body.rol && req.body.rol !== 'admin' && usuario._id.toString() === req.usuario.userId) {
    return res.status(400).json({ error: 'No puedes cambiar tu propio rol de administrador' });
  }

  for (const campo of CAMPOS_EDITABLES) {
    if (req.body[campo] !== undefined) {
      usuario[campo] = campo === 'email'
        ? String(req.body[campo]).toLowerCase().trim()
        : req.body[campo];
    }
  }

  if (req.body.password !== undefined) {
    const errorPassword = validarPassword(req.body.password);
    if (errorPassword) {
      return res.status(400).json({ error: errorPassword });
    }
    usuario.password = await bcrypt.hash(req.body.password, RONDAS_BCRYPT);
  }

  await usuario.save();

  res.json({
    mensaje: 'Usuario actualizado con éxito',
    usuario: datosPublicos(usuario)
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

module.exports = { listar, actualizar, eliminar };
