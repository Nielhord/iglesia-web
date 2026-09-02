const express = require('express');
const {
  subir, listar, obtener, actualizar, eliminar, descargar
} = require('../controllers/documentoController');
const validarToken = require('../middleware/auth');
const verificarRol = require('../middleware/role');
const upload = require('../middleware/multer');
const { limiteSubida } = require('../middleware/rateLimit');

const router = express.Router();

// --- Públicas ---
router.get('/', listar);
router.get('/:id', obtener);
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

router.put('/:id', validarToken, verificarRol(['editor', 'admin']), actualizar);
router.delete('/:id', validarToken, verificarRol(['admin']), eliminar);

module.exports = router;
