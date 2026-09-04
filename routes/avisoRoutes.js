const express = require('express');
const { listar, crear, actualizar, eliminar } = require('../controllers/avisoController');
const validarToken = require('../middleware/auth');
const verificarRol = require('../middleware/role');

const router = express.Router();

// Los avisos son información abierta, igual que el calendario: se publican para
// que la congregación los lea, con cuenta o sin ella.
router.get('/', listar);

// Crear, corregir y borrar queda en manos de editores y administradores.
router.post('/', validarToken, verificarRol(['editor', 'admin']), crear);
router.put('/:id', validarToken, verificarRol(['editor', 'admin']), actualizar);
router.delete('/:id', validarToken, verificarRol(['editor', 'admin']), eliminar);

module.exports = router;
