const express = require('express');
const authRoutes = require('./authRoutes');
const usuarioRoutes = require('./usuarioRoutes');
const documentoRoutes = require('./documentoRoutes');
const { CATEGORIAS } = require('../models/Documento');

const router = express.Router();

// Índice de la API. Útil para comprobar de un vistazo que el servidor vive.
router.get('/', (req, res) => {
  res.json({
    mensaje: 'API Iglesia IEDP Talca',
    categorias: CATEGORIAS,
    endpoints: {
      auth: [
        'POST /api/auth/register',
        'POST /api/auth/login',
        'GET  /api/auth/perfil            (token)'
      ],
      usuarios: [
        'GET    /api/usuarios             (admin)',
        'PUT    /api/usuarios/:id         (admin)',
        'DELETE /api/usuarios/:id         (admin)'
      ],
      documentos: [
        'GET    /api/documentos?categoria=Coro&pagina=1&limite=20',
        'GET    /api/documentos/:id',
        'GET    /api/documentos/:id/descargar',
        'POST   /api/documentos           (editor/admin, multipart: file)',
        'PUT    /api/documentos/:id       (editor/admin)',
        'DELETE /api/documentos/:id       (admin)'
      ]
    }
  });
});

router.use('/auth', authRoutes);
router.use('/usuarios', usuarioRoutes);
router.use('/documentos', documentoRoutes);

module.exports = router;
