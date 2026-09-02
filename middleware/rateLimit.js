const rateLimit = require('express-rate-limit');

const respuesta = (mensaje) => (req, res) =>
  res.status(429).json({ error: mensaje });

// Límite general para toda la API. Holgado: solo corta abuso evidente.
const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: respuesta('Demasiadas peticiones. Intenta de nuevo en unos minutos.')
});

// Login: lo que de verdad frena la fuerza bruta contra contraseñas.
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // solo cuentan los intentos fallidos
  handler: respuesta('Demasiados intentos de inicio de sesión. Espera 15 minutos.')
});

// Registro: evita que alguien llene la base de usuarios basura.
const limiteRegistro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: respuesta('Demasiadas cuentas creadas desde esta conexión. Intenta más tarde.')
});

// Subidas: cada una consume memoria y espacio en Supabase.
const limiteSubida = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: respuesta('Has subido demasiados archivos seguidos. Intenta más tarde.')
});

module.exports = { limiteGeneral, limiteLogin, limiteRegistro, limiteSubida };
