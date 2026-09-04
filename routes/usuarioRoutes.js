const express = require('express');
const { listar, actualizar, eliminar, aprobar, rechazar } = require('../controllers/usuarioController');
const validarToken = require('../middleware/auth');
const verificarRol = require('../middleware/role');

const router = express.Router();

// Todo lo de /usuarios requiere token + rol admin.
router.use(validarToken, verificarRol(['admin']));

router.get('/', listar);

// Aprobación de registros. Van antes de '/:id' para que las rutas con sufijo
// no queden capturadas por el parámetro.
router.put('/:id/aprobar', aprobar);
router.put('/:id/rechazar', rechazar);

router.put('/:id', actualizar);
router.delete('/:id', eliminar);

module.exports = router;
