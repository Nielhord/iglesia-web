const express = require('express');
const {
  subir, listar, obtener, actualizar, eliminar, descargar
} = require('../controllers/documentoController');
const validarToken = require('../middleware/auth');
const verificarRol = require('../middleware/role');
const upload = require('../middleware/multer');
const { limiteSubida } = require('../middleware/rateLimit');

const router = express.Router();

// --- Lectura: hace falta una sesión ---
// Los documentos son material interno de la congregación. Cualquier cuenta
// aprobada sirve (miembro, editor o admin); quien no haya iniciado sesión
// recibe 401 y el frontend le muestra el aviso en vez de un listado vacío.
router.get('/', validarToken, listar);
router.get('/:id', validarToken, obtener);

// La descarga queda sin token a propósito: es un enlace <a href> normal, que
// no puede enviar la cabecera Authorization, y lo único que hace es redirigir
// a la URL pública de Supabase. Exigir token aquí rompería las descargas sin
// proteger nada, porque esa URL ya viaja en el listado.
router.get('/:id/descargar', descargar);

// --- Protegidas ---
router.post(
  '/',
  validarToken,
  verificarRol(['editor', 'admin']),
  limiteSubida,
  upload.single('file'),
  subir
);

// Editor y admin gestionan documentos por igual. Lo que separa a un admin es
// el acceso a usuarios y aprobaciones, no a los archivos.
router.put('/:id', validarToken, verificarRol(['editor', 'admin']), actualizar);
router.delete('/:id', validarToken, verificarRol(['editor', 'admin']), eliminar);

module.exports = router;
