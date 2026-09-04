const express = require('express');
const { listar, actualizar } = require('../controllers/contenidoController');
const validarToken = require('../middleware/auth');
const verificarRol = require('../middleware/role');

const router = express.Router();

// La portada es pública, así que su contenido también.
router.get('/', listar);

router.put('/:clave', validarToken, verificarRol(['editor', 'admin']), actualizar);

module.exports = router;
