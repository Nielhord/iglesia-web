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
    rol: usuario.rol
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
    // El rol NO se lee del body: siempre queda en el default 'miembro'.
    // Solo un admin puede cambiarlo después desde PUT /api/usuarios/:id.
  });

  res.status(201).json({
    mensaje: 'Usuario registrado con éxito',
    usuario: datosPublicos(usuario),
    token: firmarToken(usuario)
  });
}

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  // El modelo tiene select:false en password, hay que pedirlo explícitamente.
  const usuario = await User
    .findOne({ email: String(email).toLowerCase().trim() })
    .select('+password');

  if (!usuario) {
    await bcrypt.compare(password, HASH_SENUELO);
    return res.status(401).json({ error: CREDENCIALES_INVALIDAS });
  }

  const passwordValida = await bcrypt.compare(password, usuario.password);
  if (!passwordValida) {
    return res.status(401).json({ error: CREDENCIALES_INVALIDAS });
  }

  res.json({
    mensaje: 'Login exitoso',
    usuario: datosPublicos(usuario),
    token: firmarToken(usuario)
  });
}

// GET /api/auth/perfil  (requiere token)
async function perfil(req, res) {
  const usuario = await User.findById(req.usuario.userId);

  if (!usuario) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  res.json({ usuario: datosPublicos(usuario) });
}

module.exports = { registrar, login, perfil, datosPublicos, validarPassword, RONDAS_BCRYPT };
