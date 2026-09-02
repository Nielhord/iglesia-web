const express = require('express');
const { registrar, login, perfil } = require('../controllers/authController');
const validarToken = require('../middleware/auth');
const { limiteLogin, limiteRegistro } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/register', limiteRegistro, registrar);
router.post('/login', limiteLogin, login);
router.get('/perfil', validarToken, perfil);

module.exports = router;
