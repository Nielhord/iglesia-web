const express = require('express');
const authRoutes = require('./authRoutes');
const usuarioRoutes = require('./usuarioRoutes');
const documentoRoutes = require('./documentoRoutes');
const actividadRoutes = require('./actividadRoutes');
const avisoRoutes = require('./avisoRoutes');
const contenidoRoutes = require('./contenidoRoutes');
const { CATEGORIAS } = require('../config/categorias');

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
        'GET    /api/usuarios?estado=pendiente   (admin)',
        'PUT    /api/usuarios/:id                (admin)',
        'PUT    /api/usuarios/:id/aprobar        (admin)',
        'PUT    /api/usuarios/:id/rechazar       (admin)',
        'DELETE /api/usuarios/:id                (admin)'
      ],
      documentos: [
        'GET    /api/documentos?categoria=Coro&pagina=1&limite=20',
        'GET    /api/documentos/:id',
        'GET    /api/documentos/:id/descargar',
        'POST   /api/documentos           (editor/admin, multipart: file)',
        'PUT    /api/documentos/:id       (editor/admin)',
        'DELETE /api/documentos/:id       (editor/admin)'
      ],
      actividades: [
        'GET    /api/actividades?categoria=Coro&desde=2026-09-01&hasta=2026-09-30',
        'POST   /api/actividades          (editor/admin)',
        'PUT    /api/actividades/:id      (editor/admin)',
        'DELETE /api/actividades/:id      (editor/admin)'
      ],
      avisos: [
        'GET    /api/avisos?categoria=Coro',
        'POST   /api/avisos               (editor/admin)',
        'PUT    /api/avisos/:id           (editor/admin)',
        'DELETE /api/avisos/:id           (editor/admin)'
      ],
      contenido: [
        'GET    /api/contenido',
        'PUT    /api/contenido/:clave     (editor/admin)'
      ]
    }
  });
});

router.use('/auth', authRoutes);
router.use('/usuarios', usuarioRoutes);
router.use('/documentos', documentoRoutes);
router.use('/actividades', actividadRoutes);
router.use('/avisos', avisoRoutes);
router.use('/contenido', contenidoRoutes);

module.exports = router;
