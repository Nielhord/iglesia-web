const mongoose = require('mongoose');
const { CATEGORIAS, ERROR_CATEGORIA } = require('../config/categorias');

const actividadSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: [true, 'El título es obligatorio'],
    trim: true,
    maxlength: [150, 'El título no puede superar los 150 caracteres']
  },

  descripcion: {
    type: String,
    default: '',
    trim: true,
    maxlength: [1000, 'La descripción no puede superar los 1000 caracteres']
  },

  categoria: {
    type: String,
    enum: { values: CATEGORIAS, message: ERROR_CATEGORIA },
    required: [true, 'La categoría es obligatoria']
  },

  // Solo el día. La hora va aparte, como texto, para no arrastrar problemas
  // de zona horaria: una reunión a las 19:00 en Talca es a las 19:00 siempre.
  fecha: {
    type: Date,
    required: [true, 'La fecha es obligatoria']
  },

  hora: {
    type: String,
    default: '',
    trim: true,
    match: [/^$|^([01]\d|2[0-3]):[0-5]\d$/, 'La hora debe tener el formato HH:MM']
  },

  lugar: {
    type: String,
    default: '',
    trim: true,
    maxlength: [120, 'El lugar no puede superar los 120 caracteres']
  },

  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Falta el autor de la actividad']
  },

  creadoEn: { type: Date, default: Date.now }
});

// El calendario siempre pide un rango de fechas de una categoría.
actividadSchema.index({ categoria: 1, fecha: 1 });

actividadSchema.set('toJSON', {
  transform: (doc, ret) => { delete ret.__v; return ret; }
});

module.exports = mongoose.model('Actividad', actividadSchema);
