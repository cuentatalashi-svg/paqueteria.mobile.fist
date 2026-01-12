
// supabase-client.js
// Cliente de Supabase para sincronización híbrida (Offline First)
// Soporte para AUTH, STORAGE y MULTI-TENANCY (Organización)

// CONFIGURACIÓN DE SUPABASE
// ¡REEMPLAZA ESTOS VALORES CON LOS DE TU PROYECTO DE SUPABASE!
var SUPABASE_URL = 'https://wkifrgqptfjnxnjzyaot.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndraWZyZ3FwdGZqbnhuanp5YW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxODA3NTEsImV4cCI6MjA4Mzc1Njc1MX0.U-r7TwEDN0eR2fSJi6BaMBnJinKp3pW4NrN-mtbNSkg';
var STORAGE_BUCKET = 'paq_images'; // Nombre del Bucket en Supabase

// Variables globales para el cliente de Supabase (no confundir con el SDK en window.supabase)
var supabaseClient = null; // Cliente creado con createClient()
var currentUser = null; // Usuario de Supabase Auth

function initSupabase() {
  // El SDK de Supabase desde CDN se expone como window.supabase.createClient
  if (!window.supabase || typeof window.supabase.createClient === 'undefined') {
    console.error('❌ ERROR CRÍTICO: Supabase SDK no cargado.');
    console.error('Esto puede ocurrir si:');
    console.error('1. No hay conexión a internet (primera carga)');
    console.error('2. El CDN está bloqueado por firewall/red');
    console.error('3. Hay problemas de CORS en el navegador');
    console.error('Verifica la consola del navegador y tu conexión.');

    // Mostrar alerta visible al usuario en dispositivos móviles
    if (typeof alert !== 'undefined') {
      alert('⚠️ Error: No se pudo cargar Supabase.\n\nVerifica tu conexión a internet y recarga la página.\n\nSi el problema persiste, contacta soporte.');
    }
    return;
  }
  if (!supabaseClient) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log('✅ Supabase inicializado correctamente.');

      // Recuperar sesión si existe
      supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          currentUser = session.user;
          console.log("📱 Sesión recuperada:", currentUser.email);
          // checkUserRoleAndOrg(currentUser.id); // Opcional: refrescar metadatos
        } else {
          console.log("ℹ️ No hay sesión activa.");
        }
      }).catch(err => {
        console.error('⚠️ Error al recuperar sesión:', err);
      });

      // Escuchar cambios de auth
      supabaseClient.auth.onAuthStateChange((event, session) => {
        currentUser = session ? session.user : null;
        if (event === 'SIGNED_OUT') {
          // Limpiar datos locales sensibles si se desea, o mantener offline
          console.log("🚪 Sesión cerrada.");
        }
      });

    } catch (e) {
      console.error('❌ Error crítico al inicializar Supabase:', e);
      console.error('Detalles:', e.message);
      if (typeof alert !== 'undefined') {
        alert('⚠️ Error al inicializar Supabase: ' + e.message);
      }
    }
  }
}

// --- AUTHENTICATION ---

async function sbLogin(email, password) {
  if (!supabaseClient) return { error: 'Supabase no inicializado' };
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (data.user) currentUser = data.user;
  return { data, error };
}

/**
 * Registra un usuario. 
 * Si orgId está vacío, se asume que es ADMIN de una NUEVA organización (usando su ID como orgId).
 * Si orgId tiene valor, se asume que es GUARDIA uniéndose a esa organización.
 */
async function sbRegister(email, password, nombre) {
  if (!supabaseClient) return { error: 'Supabase no inicializado' };

  // 1. Crear usuario en Auth
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: nombre } // Metadata básica
    }
  });

  if (error) return { error };

  return { data, error: null };
}

async function sbLogout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  currentUser = null;
}

// --- STORAGE ---

/**
 * Sube una imagen (Base64 o File) al bucket.
 * Retorna la URL pública.
 */
async function uploadImageToBucket(fileOrBase64, fileName) {
  if (!supabaseClient || !navigator.onLine) return null;

  try {
    let fileToUpload = fileOrBase64;

    // Convertir Base64 a Blob si es necesario
    if (typeof fileOrBase64 === 'string' && fileOrBase64.includes('base64')) {
      const arr = fileOrBase64.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) { u8arr[n] = bstr.charCodeAt(n); }
      fileToUpload = new Blob([u8arr], { type: mime });
    }

    const { data, error } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, fileToUpload, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('[Storage] Error subiendo imagen:', error);
      return null;
    }

    // Obtener URL pública
    const { data: { publicUrl } } = supabaseClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName);

    return publicUrl;

  } catch (err) {
    console.error('[Storage] Excepción:', err);
    return null;
  }
}



// --- SYNC ---

/**
 * Mapea nombres de campos de local (camelCase) a Supabase (lowercase)
 */
function mapToSupabaseFields(obj, tableName) {
  if (tableName === 'paquetes') {
    const mapped = { ...obj };
    // Mapear campos camelCase a lowercase
    if (obj.recibidoPor !== undefined) mapped.recibidopor = obj.recibidoPor;
    // NOTA: fotoRecibidoPor y fotoEntregadoPor NO existen en Supabase, se omiten
    if (obj.entregadoPor !== undefined) mapped.entregadopor = obj.entregadoPor;
    // NOTA: fotoEntregadoPor NO existe en Supabase, se omite
    if (obj.entregadoEn !== undefined) mapped.entregadoen = obj.entregadoEn;
    if (obj.entregadoA !== undefined) mapped.entregadoa = obj.entregadoA;
    if (obj.idFoto !== undefined) mapped.idfoto = obj.idFoto;
    if (obj.idFoto_cloud_url !== undefined) mapped.idfoto_cloud_url = obj.idFoto_cloud_url;

    // Eliminar versiones camelCase para evitar duplicados
    delete mapped.recibidoPor;
    delete mapped.fotoRecibidoPor; // No existe en Supabase
    delete mapped.entregadoPor;
    delete mapped.fotoEntregadoPor; // No existe en Supabase
    delete mapped.entregadoEn;
    delete mapped.entregadoA;
    delete mapped.idFoto;
    delete mapped.idFoto_cloud_url;

    return mapped;
  }
  if (tableName === 'historial') {
    const mapped = { ...obj };
    if (obj.paqueteId !== undefined) mapped.paqueteid = obj.paqueteId;
    if (obj.entregadoA !== undefined) mapped.entregadoa = obj.entregadoA;
    delete mapped.paqueteId;
    delete mapped.entregadoA;
    return mapped;
  }
  return obj;
}

/**
 * Mapea nombres de campos de Supabase (lowercase) a local (camelCase)
 */
function mapFromSupabaseFields(obj, tableName) {
  if (tableName === 'paquetes') {
    const mapped = { ...obj };
    // Mapear campos lowercase a camelCase
    if (obj.recibidopor !== undefined) mapped.recibidoPor = obj.recibidopor;
    if (obj.fotorecibidopor !== undefined) mapped.fotoRecibidoPor = obj.fotorecibidopor;
    if (obj.entregadopor !== undefined) mapped.entregadoPor = obj.entregadopor;
    if (obj.fotoentregadopor !== undefined) mapped.fotoEntregadoPor = obj.fotoentregadopor;
    if (obj.entregadoen !== undefined) mapped.entregadoEn = obj.entregadoen;
    if (obj.entregadoa !== undefined) mapped.entregadoA = obj.entregadoa;
    if (obj.idfoto !== undefined) mapped.idFoto = obj.idfoto;
    if (obj.idfoto_cloud_url !== undefined) mapped.idFoto_cloud_url = obj.idfoto_cloud_url;

    // Mantener ambas versiones por compatibilidad
    return mapped;
  }
  if (tableName === 'historial') {
    const mapped = { ...obj };
    if (obj.paqueteid !== undefined) mapped.paqueteId = obj.paqueteid;
    if (obj.entregadoa !== undefined) mapped.entregadoA = obj.entregadoa;
    return mapped;
  }
  return obj;
}

/**
 * Sincroniza una tabla considerando organization_id.
 * Sube imágenes pendientes si encuentra Base64 pero no URL.
 */
async function syncTable(tableName, orgId) {
  if (!supabaseClient || !orgId) return;
  if (!navigator.onLine) {
    console.log(`[Sync] Offline. Omitiendo sync de ${tableName}.`);
    return;
  }

  console.log(`[Sync] Iniciando sync de ${tableName} (Org: ${orgId})...`);

  try {
    const localData = await getAll(tableName);
    // Filtrar solo datos de SU organización para subir
    const myMsgData = localData.filter(d => d.organization_id === orgId);

    // --- FASE 0: SUBIDA DE IMÁGENES PENDIENTES ---
    // Si hay items con foto (Base64) pero sin foto_url (Cloud), subir primero.
    if (tableName === 'paquetes' || tableName === 'users') {
      for (const item of myMsgData) {
        let updated = false;

        // FOTO PRINCIPAL
        if (item.foto && item.foto.startsWith('data:') && !item.foto_cloud_url) {
          try {
            console.log(`[Sync] Subiendo foto para ${item.guia || item.usuario}...`);
            const fileName = `${orgId}/${tableName}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
            const url = await uploadImageToBucket(item.foto, fileName);
            if (url) {
              item.foto_cloud_url = url;
              updated = true;
              console.log(`[Sync] ✅ Foto subida: ${fileName}`);
            } else {
              console.warn(`[Sync] ⚠️ Storage upload falló, continuando sin URL cloud para ${item.guia || item.usuario}`);
            }
          } catch (err) {
            console.warn(`[Sync] ⚠️ Error subiendo foto (continuando):`, err.message);
          }
        }

        // FOTO FIRMA (solo paquetes)
        if (item.firma && item.firma.startsWith('data:') && !item.firma_cloud_url) {
          try {
            const fileName = `${orgId}/${tableName}/firmas/${Date.now()}_${item.guia || 'firma'}.png`;
            const url = await uploadImageToBucket(item.firma, fileName);
            if (url) { item.firma_cloud_url = url; updated = true; }
          } catch (err) {
            console.warn(`[Sync] ⚠️ Error subiendo firma (continuando):`, err.message);
          }
        }

        // FOTO ID (solo paquetes)
        if (item.idFoto && item.idFoto.startsWith('data:') && !item.idFoto_cloud_url) {
          try {
            const fileName = `${orgId}/${tableName}/ids/${Date.now()}_${item.guia || 'id'}.jpg`;
            const url = await uploadImageToBucket(item.idFoto, fileName);
            if (url) { item.idFoto_cloud_url = url; updated = true; }
          } catch (err) {
            console.warn(`[Sync] ⚠️ Error subiendo ID foto (continuando):`, err.message);
          }
        }

        if (updated) {
          await putItem(tableName, item); // Guardar URL en local antes de subir registro
        }
      }
    }

    // --- FASE 1: DESCARGAR ---
    const { data: remoteData, error } = await supabaseClient
      .from(tableName)
      .select('*')
      .eq('organization_id', orgId); // SOLO DATOS DE MI ORG

    if (error) {
      console.warn(`[Sync] Error descargando ${tableName}:`, error.message);
      // No lanzar error, continuar con subida
    } else if (remoteData && remoteData.length > 0) {
      console.log(`[Sync] Descargados ${remoteData.length} registros de ${tableName}`);

      // Mapear campos de Supabase a formato local
      const mappedRemoteData = remoteData.map(item => mapFromSupabaseFields(item, tableName));

      // Guardar datos remotos en local (merge estrategia)
      for (const remoteItem of mappedRemoteData) {
        try {
          // Buscar si ya existe localmente
          const existingLocal = myMsgData.find(local => {
            if (tableName === 'paquetes') return local.guia === remoteItem.guia;
            if (tableName === 'users') return local.email === remoteItem.email;
            return local.id === remoteItem.id;
          });

          if (!existingLocal) {
            // No existe local, agregar
            await addItem(tableName, remoteItem);
          } else {
            // Existe, actualizar con datos remotos (last write wins desde servidor)
            await putItem(tableName, { ...existingLocal, ...remoteItem, id: existingLocal.id });
          }
        } catch (err) {
          console.warn(`[Sync] Error guardando item remoto de ${tableName}:`, err);
        }
      }
    }

    // --- FASE 2: SUBIR (Upsert) ---
    // "Last Write Wins" simple o "Upload missing".
    // Estrategia: Subir lo que tengo en local que no esté en remoto (o actualizado).

    // Para simplificar, hacemos UPSERT de todo lo local modificado recientemente hacia la nube.
    // Lo ideal es tener un campo 'synced_at'. 
    // Haremos Upsert de todos los locales hacia la nube para asegurar.

    if (myMsgData.length > 0) {
      // Limpiamos IDs numéricos locales si Supabase usa UUID o Identity, 
      // PERO necesitamos match. Usaremos 'guia' (paquetes) o 'email/usuario' (users) como clave lógica.

      const updates = myMsgData.map(local => {
        // Mapear campos a formato Supabase
        let up = mapToSupabaseFields({ ...local }, tableName);
        delete up.id; // Dejar que Supabase maneje el ID primario

        // CRÍTICO: Eliminar campos que no existen en Supabase
        if (tableName === 'users') {
          // La tabla users en Supabase NO tiene 'created', solo 'created_at' (auto)
          delete up.created;
        }

        // Asegurar org_id
        up.organization_id = orgId;

        // Limpiar valores undefined/null que pueden causar problemas
        Object.keys(up).forEach(key => {
          if (up[key] === undefined) {
            delete up[key];
          }
        });

        return up;
      });

      // Upsert en lotes
      // Nota: onConflict debe coincidir con una restricción UNIQUE en Supabase.
      // Paquetes: (guia, organization_id) - constraint compound
      // Users: email - constraint simple

      // Determinar columnas para conflict
      let conflictColumns;
      if (tableName === 'paquetes') {
        conflictColumns = 'guia,organization_id';  // Compound unique constraint
      } else if (tableName === 'users') {
        conflictColumns = 'email';  // Simple unique constraint
      } else {
        conflictColumns = 'id';  // Fallback
      }

      if (updates.length > 0) {
        const { error: upsertError } = await supabaseClient
          .from(tableName)
          .upsert(updates, {
            onConflict: conflictColumns,
            ignoreDuplicates: false
          });

        if (upsertError) {
          console.error(`[Sync] ❌ Error upserting ${tableName}:`, upsertError.message);
          console.error(`[Sync] Detalles:`, upsertError);
        } else {
          console.log(`[Sync] ✅ ${updates.length} registros upserteados a ${tableName}`);
        }
      }
    }

    console.log(`[Sync] ${tableName} sincronizado.`);

  } catch (err) {
    console.error(`[Sync] Error sincronizando ${tableName}:`, err);
  }
}

async function syncAll(orgId) {
  if (!orgId) return;
  await syncTable('users', orgId); // Tabla pública de usuarios (perfiles)
  await syncTable('domicilios', orgId);
  await syncTable('paquetes', orgId);
  await syncTable('historial', orgId);
}
