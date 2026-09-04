const express = require('express');
const { listar, crear, actualizar, eliminar } = require('../controllers/actividadController');
const validarToken = require('../middleware/auth');
const verificarRol = require('../middleware/role');

const router = express.Router();

// El calendario es información abierta: cualquiera que entre a una rama puede
// ver qué actividades hay, tenga cuenta o no. Lo reservado son los documentos.
router.get('/', listar);

// Crear, corregir y borrar queda en manos de editores y administradores.
router.post('/', validarToken, verificarRol(['editor', 'admin']), crear);
router.put('/:id', validarToken, verificarRol(['editor', 'admin']), actualizar);
router.delete('/:id', validarToken, verificarRol(['editor', 'admin']), eliminar);

module.exports = router;
