/* sql-lite.js — IndexedDB helper (CON FUNCIONES DE RESPALDO) */
const DB_NAME = "ctrl_paqueteria_db_v1";
const DB_VERSION = 3;
let DB;

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      const tx = e.target.transaction;
      
      console.log(`Actualizando base de datos a v${DB_VERSION}...`);

      // --- Users Store ---
      let userStore;
      if(!db.objectStoreNames.contains('users')){
        userStore = db.createObjectStore('users',{keyPath:'id',autoIncrement:true});
        userStore.createIndex('usuario','usuario',{unique:true});
      } else {
        userStore = tx.objectStore('users');
      }
      if (!userStore.indexNames.contains('rol')) {
        userStore.createIndex('rol', 'rol', { unique: false });
        console.log("Índice 'rol' creado en 'users'.");
      }

      // --- Domicilios Store ---
      if(!db.objectStoreNames.contains('domicilios')){
        const s = db.createObjectStore('domicilios',{keyPath:'id',autoIncrement:true});
        s.createIndex('calle','calle',{unique:false});
      }

      // --- Paquetes Store ---
      let paqueteStore;
      if(!db.objectStoreNames.contains('paquetes')){
        paqueteStore = db.createObjectStore('paquetes',{keyPath:'id',autoIncrement:true});
        paqueteStore.createIndex('guia','guia',{unique:true});
        paqueteStore.createIndex('nombre','nombre',{unique:false});
      } else {
        paqueteStore = tx.objectStore('paquetes');
      }
      if (!paqueteStore.indexNames.contains('estado')) {
        paqueteStore.createIndex('estado', 'estado', { unique: false });
      }
      if (!paqueteStore.indexNames.contains('domicilio')) {
        paqueteStore.createIndex('domicilio', 'domicilio', { unique: false });
      }

      // --- Historial Store ---
      if(!db.objectStoreNames.contains('historial')){
        const s = db.createObjectStore('historial',{keyPath:'id',autoIncrement:true});
        s.createIndex('paqueteId','paqueteId',{unique:false});
        s.createIndex('fecha','fecha',{unique:false});
        s.createIndex('estado','estado',{unique:false});
      }
      
      console.log("Actualización de BD completada.");
    };
    
    req.onsuccess = (e)=>{DB=e.target.result;resolve(DB)};
    req.onerror = (e)=>{reject(e)};
  });
}

function tx(storeName, mode='readwrite'){
  const t = DB.transaction([storeName], mode);
  return t.objectStore(storeName);
}

async function addItem(store, data){
  return new Promise((resolve,reject)=>{
    const st = tx(store);
    const req = st.add(data);
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = (e)=>reject(e);
  });
}
async function putItem(store, data){
  return new Promise((resolve,reject)=>{
    const st = tx(store);
    const req = st.put(data);
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = (e)=>reject(e);
  });
}
async function deleteItem(store, key){
  return new Promise((resolve,reject)=>{
    const st = tx(store);
    const req = st.delete(key);
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = (e)=>reject(e);
  });
}
async function getByIndex(store, indexName, value){
  return new Promise((resolve,reject)=>{
    const st = tx(store,'readonly');
    const idx = st.index(indexName);
    const req = idx.get(value);
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = (e)=>reject(e);
  });
}
async function getAll(store){
  return new Promise((resolve,reject)=>{
    const st = tx(store,'readonly');
    const req = st.getAll();
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = (e)=>reject(e);
  });
}
async function getByKey(store, key){
  return new Promise((resolve,reject)=>{
    const st = tx(store,'readonly');
    const req = st.get(key);
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = (e)=>reject(e);
  });
}
async function query(store, callback){
  return new Promise((resolve,reject)=>{
    const st = tx(store,'readonly');
    const req = st.openCursor();
    const out = [];
    req.onsuccess = (e)=>{
      const cur = e.target.result;
      if(!cur){ resolve(out); return; }
      const res = callback(cur);
      if(res !== false) out.push(cur.value);
      cur.continue();
    };
    req.onerror = (e)=>reject(e);
  });
}

// --- INICIO: NUEVAS FUNCIONES DE RESPALDO ---

/**
 * Borra todos los datos de un object store.
 * @param {string} storeName - El nombre del store a limpiar.
 */
async function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const st = tx(storeName);
    const req = st.clear();
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

/**
 * Añade un array de items a un store.
 * @param {string} storeName - El nombre del store.
 * @param {Array<Object>} items - Los items a añadir.
 */
async function bulkAdd(storeName, items) {
  return new Promise((resolve, reject) => {
    // Iniciar transacción para todas las operaciones
    const t = DB.transaction([storeName], 'readwrite');
    const st = t.objectStore(storeName);

    // Si la tienda es auto-incrementable, debemos quitar el ID
    // para que IndexedDB genere uno nuevo y no haya conflictos.
    const needsIdRemoval = st.autoIncrement;

    // Manejadores de la transacción
    t.onerror = (e) => reject(e);
    t.oncomplete = () => resolve();
    
    if (!items || items.length === 0) {
      resolve(); // Nada que añadir
      return;
    }

    // Iterar y añadir cada item
    items.forEach(item => {
      // Crear una copia para no modificar el objeto original
      const itemToAdd = { ...item }; 
      
      if (needsIdRemoval && itemToAdd.id !== undefined) {
        delete itemToAdd.id;
      }
      st.add(itemToAdd);
    });
  });
}
// --- FIN: NUEVAS FUNCIONES DE RESPALDO ---

