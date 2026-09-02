const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

// Verifica el token y deja el payload en req.usuario.
function validarToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No se proporcionó token' });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({ error: 'Token mal formado' });
  }

  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    const expirado = error.name === 'TokenExpiredError';
    return res.status(401).json({
      error: expirado ? 'Token expirado, vuelve a iniciar sesión' : 'Token inválido'
    });
  }
}

// Igual que validarToken, pero no falla si no hay token.
// Útil en rutas públicas que muestran más datos a un usuario autenticado.
function tokenOpcional(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      req.usuario = jwt.verify(authHeader.slice(7).trim(), JWT_SECRET);
    } catch {
      // Token inválido en ruta pública: se ignora y sigue como anónimo.
    }
  }

  next();
}

module.exports = validarToken;
module.exports.validarToken = validarToken;
module.exports.tokenOpcional = tokenOpcional;
