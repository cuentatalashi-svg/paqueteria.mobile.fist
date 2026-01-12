Proyecto: ctrl-paqueteria_final
Versión final SPA con trazabilidad y visor de imágenes.
Incluye:
• index.html (antes login.html)
• main.html
• styles.css
• app.js
• sql-lite.js
• README.txt
Características:
• Guarda quién recibe y quién entrega (recibidoPor, entregadoPor).
• Miniaturas grandes (120x120) en historial con visor de imágenes.
• Navegación en visor (◀ ▶) entre foto paquete, ID y firma.
• Datos persistentes en IndexedDB (una única conexión SPA).
Nuevas Características (v2):
• Roles de Admin (con código ADMIN123) para eliminar paquetes/usuarios y descargar PDF.
• Web Share API para notificaciones (con fallback a WhatsApp).
• Contador de paquetes en historial.
• Registro de foto de guardia (obligatorio).
• Trazabilidad de foto de guardia en historial (quién recibió/entregó).
• Opción para "No notificar" al residente.
• Campo de "Comentarios" por paquete.
• Rediseño de historial a formato "Cards" (tarjetas) más visuales.