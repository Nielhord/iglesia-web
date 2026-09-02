const multer = require('multer');
const { MAX_FILE_SIZE_BYTES } = require('../config/env');

// Los tipos que la iglesia sube en la práctica: partituras, actas,
// boletines e imágenes. Se excluye a propósito HTML y SVG: al servirse
// desde una URL pública de Supabase podrían ejecutar scripts (XSS).
const TIPOS_PERMITIDOS = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['application/msword', 'doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.ms-excel', 'xls'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['application/vnd.ms-powerpoint', 'ppt'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
  ['audio/mpeg', 'mp3'],
  ['text/plain', 'txt']
]);

const upload = multer({
  // En memoria porque el archivo se reenvía a Supabase, no se guarda en disco.
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
    fields: 10
  },
  fileFilter: (req, file, cb) => {
    if (!TIPOS_PERMITIDOS.has(file.mimetype)) {
      return cb(new TipoArchivoNoPermitido(file.mimetype));
    }
    cb(null, true);
  }
});

class TipoArchivoNoPermitido extends Error {
  constructor(mimetype) {
    super(`Tipo de archivo no permitido: ${mimetype}`);
    this.name = 'TipoArchivoNoPermitido';
    this.status = 415;
  }
}

// La extensión se decide por el MIME real, no por el nombre que envía el
// cliente. Así un "factura.pdf.exe" no puede colar una extensión arbitraria.
function extensionSegura(mimetype) {
  return TIPOS_PERMITIDOS.get(mimetype) || 'bin';
}

module.exports = upload;
module.exports.upload = upload;
module.exports.extensionSegura = extensionSegura;
module.exports.TipoArchivoNoPermitido = TipoArchivoNoPermitido;
module.exports.TIPOS_PERMITIDOS = TIPOS_PERMITIDOS;
