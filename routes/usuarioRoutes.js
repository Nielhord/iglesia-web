const express = require('express');
const { listar, actualizar, eliminar } = require('../controllers/usuarioController');
const validarToken = require('../middleware/auth');
const verificarRol = require('../middleware/role');

const router = express.Router();

// Todo lo de /usuarios requiere token + rol admin.
router.use(validarToken, verificarRol(['admin']));

router.get('/', listar);
router.put('/:id', actualizar);
router.delete('/:id', eliminar);

module.exports = router;
