const mongoose = require('mongoose');

// Validación de formato razonablemente estricta sin volverse loco:
// algo@algo.dominio, sin espacios.
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const userSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre es obligatorio'],
    trim: true,
    minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
    maxlength: [80, 'El nombre no puede superar los 80 caracteres']
  },

  email: {
    type: String,
    required: [true, 'El email es obligatorio'],
    unique: true,
    // Sin esto, "Juan@x.com" y "juan@x.com" se registran como dos cuentas
    // distintas pese al índice unique.
    lowercase: true,
    trim: true,
    maxlength: [120, 'El email no puede superar los 120 caracteres'],
    match: [FORMATO_EMAIL, 'El formato del email no es válido']
  },

  password: {
    type: String,
    required: [true, 'La contraseña es obligatoria'],
    // Nunca se devuelve salvo que se pida explícitamente con .select('+password')
    select: false
  },

  rol: {
    type: String,
    enum: {
      values: ['miembro', 'editor', 'admin'],
      message: 'El rol debe ser miembro, editor o admin'
    },
    default: 'miembro'
  },

  // Aprobación de registros: una cuenta nueva no puede iniciar sesión hasta
  // que un admin la apruebe.
  //
  // Los usuarios creados antes de esta función no tienen el campo. Se tratan
  // como aprobados (ver estaAprobado más abajo) para no dejar a nadie fuera.
  estado: {
    type: String,
    enum: {
      values: ['pendiente', 'aprobado', 'rechazado'],
      message: 'El estado debe ser pendiente, aprobado o rechazado'
    },
    default: 'pendiente'
  },

  // Rastro de quién resolvió la solicitud y cuándo.
  revisadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  fechaRevision: { type: Date, default: null },

  fechaRegistro: { type: Date, default: Date.now }
});

// Buscar las solicitudes pendientes es la consulta de la página de aprobación.
userSchema.index({ estado: 1, fechaRegistro: -1 });

// Oculta password y __v en cualquier res.json(usuario).
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

/* Un usuario puede entrar si está aprobado explícitamente, o si es anterior
   a esta función y por tanto no tiene el campo. Cualquier otro valor
   ('pendiente', 'rechazado') bloquea el acceso. */
function estaAprobado(usuario) {
  return usuario.estado === undefined
    || usuario.estado === null
    || usuario.estado === 'aprobado';
}

module.exports = mongoose.model('User', userSchema);
module.exports.FORMATO_EMAIL = FORMATO_EMAIL;
module.exports.estaAprobado = estaAprobado;
