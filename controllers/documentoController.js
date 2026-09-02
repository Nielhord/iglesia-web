const { randomUUID } = require('crypto');
const Documento = require('../models/Documento');
const { CATEGORIAS } = Documento;
const { bucket } = require('../config/supabase');
const { extensionSegura } = require('../middleware/multer');
const { BASE_URL } = require('../config/env');

// Se expone el nombre de quien subió el archivo, pero NO su email: el
// listado es público y filtrar correos es una fuga de datos personales.
const CAMPOS_SUBIDOR = 'nombre';

function conUrlDescarga(doc) {
  const obj = doc.toJSON();
  obj.urlDescarga = `${BASE_URL}/api/documentos/${doc._id}/descargar`;
  return obj;
}

// POST /api/documentos  (editor/admin)
async function subir(req, res) {
  const { titulo, descripcion, categoria } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }
  if (!titulo || !categoria) {
    return res.status(400).json({ error: 'Título y categoría son obligatorios' });
  }
  if (!CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: `Categoría inválida. Opciones: ${CATEGORIAS.join(', ')}` });
  }

  // La extensión sale del MIME real, no del nombre enviado por el cliente.
  const extension = extensionSegura(req.file.mimetype);
  const rutaEnBucket = `uploads/${randomUUID()}.${extension}`;

  const { error: errorSubida } = await bucket().upload(rutaEnBucket, req.file.buffer, {
    contentType: req.file.mimetype,
    upsert: false
  });

  if (errorSubida) {
    console.error('❌ Error subiendo a Supabase:', errorSubida);
    return res.status(502).json({ error: 'No se pudo almacenar el archivo' });
  }

  const { data: urlPublica } = bucket().getPublicUrl(rutaEnBucket);

  try {
    const documento = await Documento.create({
      titulo,
      descripcion: descripcion || '',
      categoria,
      tipoArchivo: extension,
      nombreOriginal: req.file.originalname,
      tamanoBytes: req.file.size,
      archivoURL: urlPublica.publicUrl,
      publicId: rutaEnBucket,
      subidoPor: req.usuario.userId
    });

    res.status(201).json({
      mensaje: 'Archivo subido con éxito',
      documento: conUrlDescarga(documento)
    });

  } catch (error) {
    // Si el guardado en Mongo falla, el archivo ya está en Supabase y
    // quedaría huérfano. Se limpia antes de propagar el error.
    await bucket().remove([rutaEnBucket]).catch(err =>
      console.error('⚠️  No se pudo limpiar el archivo huérfano', rutaEnBucket, err)
    );
    throw error;
  }
}

// GET /api/documentos?categoria=Coro&pagina=1&limite=20
async function listar(req, res) {
  const { categoria } = req.query;

  if (categoria && !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: `Categoría inválida. Opciones: ${CATEGORIAS.join(', ')}` });
  }

  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const limite = Math.min(100, Math.max(1, Number(req.query.limite) || 20));
  const filtro = categoria ? { categoria } : {};

  const [documentos, total] = await Promise.all([
    Documento.find(filtro)
      .populate('subidoPor', CAMPOS_SUBIDOR)
      .sort({ fechaSubida: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite),
    Documento.countDocuments(filtro)
  ]);

  res.json({
    filtro: categoria || 'todos',
    total,
    pagina,
    paginas: Math.ceil(total / limite) || 1,
    documentos: documentos.map(conUrlDescarga)
  });
}

// GET /api/documentos/:id
async function obtener(req, res) {
  const documento = await Documento.findById(req.params.id).populate('subidoPor', CAMPOS_SUBIDOR);

  if (!documento) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }

  res.json({ documento: conUrlDescarga(documento) });
}

// PUT /api/documentos/:id  (editor/admin)
async function actualizar(req, res) {
  const { titulo, descripcion, categoria } = req.body;

  const documento = await Documento.findById(req.params.id);
  if (!documento) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }

  if (categoria !== undefined && !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: `Categoría inválida. Opciones: ${CATEGORIAS.join(', ')}` });
  }

  if (titulo !== undefined) documento.titulo = titulo;
  if (descripcion !== undefined) documento.descripcion = descripcion;
  if (categoria !== undefined) documento.categoria = categoria;

  await documento.save();

  res.json({
    mensaje: 'Documento actualizado con éxito',
    documento: conUrlDescarga(documento)
  });
}

// DELETE /api/documentos/:id  (admin)
async function eliminar(req, res) {
  const documento = await Documento.findById(req.params.id);

  if (!documento) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }

  // Primero el archivo. Si esto falla y aun así borráramos el registro,
  // el archivo quedaría en el bucket para siempre sin nadie que lo referencie.
  const { error: errorBorrado } = await bucket().remove([documento.publicId]);

  if (errorBorrado) {
    console.error('❌ Error eliminando archivo en Supabase:', errorBorrado);
    return res.status(502).json({
      error: 'No se pudo eliminar el archivo del almacenamiento. El documento no fue borrado.'
    });
  }

  await documento.deleteOne();

  res.json({ mensaje: 'Documento eliminado del almacenamiento y de la base de datos' });
}

// GET /api/documentos/:id/descargar
async function descargar(req, res) {
  const documento = await Documento.findById(req.params.id);

  if (!documento) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }

  res.redirect(documento.archivoURL);
}

module.exports = { subir, listar, obtener, actualizar, eliminar, descargar };
