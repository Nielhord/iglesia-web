const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/env');

const RONDAS_BCRYPT = 12;
const MIN_PASSWORD = 8;

// Mensaje único para credenciales incorrectas. Distinguir entre "no existe
// ese email" y "contraseña incorrecta" permite a un atacante enumerar qué
// correos están registrados.
const CREDENCIALES_INVALIDAS = 'Email o contraseña incorrectos';

// Hash real de una contraseña ficticia. Se compara contra él cuando el email
// no existe, para que la respuesta tarde lo mismo exista o no el usuario y
// no se pueda deducir por el tiempo. Se calcula una sola vez, al arrancar.
const HASH_SENUELO = bcrypt.hashSync('contrasena-senuelo-para-igualar-tiempos', RONDAS_BCRYPT);

function validarPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`;
  }
  if (password.length > 200) {
    return 'La contraseña es demasiado larga';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La contraseña debe incluir al menos una letra y un número';
  }
  return null;
}

function firmarToken(usuario) {
  return jwt.sign(
    { userId: usuario._id.toString(), rol: usuario.rol },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function datosPublicos(usuario) {
  return {
    id: usuario._id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    // Las cuentas anteriores a la aprobación no tienen el campo; se muestran
    // como aprobadas, que es como las trata el login.
    estado: usuario.estado || 'aprobado',
    fechaRegistro: usuario.fechaRegistro
  };
}

// POST /api/auth/register
async function registrar(req, res) {
  const { nombre, email, password } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios' });
  }

  const errorPassword = validarPassword(password);
  if (errorPassword) {
    return res.status(400).json({ error: errorPassword });
  }

  const emailNormalizado = String(email).toLowerCase().trim();

  if (await User.exists({ email: emailNormalizado })) {
    return res.status(409).json({ error: 'Ese email ya está registrado' });
  }

  const usuario = await User.create({
    nombre,
    email: emailNormalizado,
    password: await bcrypt.hash(password, RONDAS_BCRYPT)
    // Ni el rol ni el estado se leen del body: quedan en sus valores por
    // defecto ('miembro' y 'pendiente'). Solo un admin puede cambiarlos.
  });

  // Deliberadamente NO se devuelve token: la cuenta todavía no puede entrar.
  // Devolverlo daría acceso inmediato y anularía la aprobación.
  res.status(201).json({
    mensaje: 'Solicitud enviada. Un administrador debe aprobar tu cuenta antes '
      + 'de que puedas iniciar sesión.',
    usuario: datosPublicos(usuario)
  });
}

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  // select('+password') porque el modelo lo oculta por defecto.
  //
  // .lean() no es una optimización: es necesario. Mongoose aplica los valores
  // por defecto del schema también al hidratar un documento, así que una
  // cuenta anterior a la aprobación (sin el campo 'estado' en la base) se
  // leería como 'pendiente' y quedaría bloqueada. lean() devuelve el
  // documento tal cual está guardado.
  const usuario = await User
    .findOne({ email: String(email).toLowerCase().trim() })
    .select('+password')
    .lean();

  if (!usuario) {
    await bcrypt.compare(password, HASH_SENUELO);
    return res.status(401).json({ error: CREDENCIALES_INVALIDAS });
  }

  const passwordValida = await bcrypt.compare(password, usuario.password);
  if (!passwordValida) {
    return res.status(401).json({ error: CREDENCIALES_INVALIDAS });
  }

  // La comprobación de estado va DESPUÉS de validar la contraseña. Así el
  // mensaje "pendiente de aprobación" solo lo ve quien ya demostró ser dueño
  // de la cuenta, y no sirve para averiguar qué emails están registrados.
  if (!User.estaAprobado(usuario)) {
    return res.status(403).json({
      error: usuario.estado === 'rechazado'
        ? 'Tu solicitud de registro fue rechazada. Contacta con la administración de la iglesia.'
        : 'Tu cuenta está pendiente de aprobación. Un administrador debe autorizarla.',
      estado: usuario.estado
    });
  }

  res.json({
    mensaje: 'Login exitoso',
    usuario: datosPublicos(usuario),
    token: firmarToken(usuario)
  });
}

// GET /api/auth/perfil  (requiere token)
async function perfil(req, res) {
  // .lean() por el mismo motivo que en login: no inventar un 'estado' que
  // la cuenta no tiene guardado.
  const usuario = await User.findById(req.usuario.userId).lean();

  if (!usuario) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  res.json({ usuario: datosPublicos(usuario) });
}

module.exports = { registrar, login, perfil, datosPublicos, validarPassword, RONDAS_BCRYPT };
