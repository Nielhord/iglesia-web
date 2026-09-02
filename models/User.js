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

  fechaRegistro: { type: Date, default: Date.now }
});

// Oculta password y __v en cualquier res.json(usuario).
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
module.exports.FORMATO_EMAIL = FORMATO_EMAIL;
