const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { CORS_ORIGINS, esProduccion } = require('./config/env');
const rutas = require('./routes');
const { limiteGeneral } = require('./middleware/rateLimit');
const { noEncontrado, manejadorErrores } = require('./middleware/errorHandler');

const app = express();

// Detrás de un proxy (Render, Railway, Nginx) la IP real viene en
// X-Forwarded-For. Sin esto el rate limit vería una única IP para todos.
if (esProduccion) {
  app.set('trust proxy', 1);
}

// Cabeceras de seguridad (X-Content-Type-Options, Referrer-Policy, HSTS…).
app.use(helmet({
  // La API solo devuelve JSON y redirecciones; el frontend vive en otro origen.
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin(origin, callback) {
    // Sin cabecera Origin: curl, Postman, health checks. Se permiten.
    if (!origin) return callback(null, true);

    if (CORS_ORIGINS.includes(origin)) return callback(null, true);

    const error = new Error(`Origen no autorizado por CORS: ${origin}`);
    error.status = 403;
    callback(error);
  },
  credentials: true
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Comprobación de estado para monitorización. Va antes del rate limit
// para que un chequeo cada minuto no acabe bloqueándose a sí mismo.
app.get('/health', (req, res) => {
  res.json({ estado: 'ok', hora: new Date().toISOString() });
});

app.use(limiteGeneral);

// Raíz: solo apunta a dónde vive la API.
app.get('/', (req, res) => {
  res.json({ mensaje: 'API Iglesia IEDP Talca', documentacion: '/api' });
});

app.use('/api', rutas);

app.use(noEncontrado);
app.use(manejadorErrores);

module.exports = app;
