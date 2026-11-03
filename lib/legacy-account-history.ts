import { accountStorageKey } from "./account-storage";

/** Explicit administrator action only. Copies historical browser data; never removes originals. */
export async function copyLegacyHistory() {
  let added=0;
  for(const key of ["perdesign-research-history-v1","perdesign-mindmap-history-v1"]) {
    const source=JSON.parse(localStorage.getItem(key)||"[]");
    const destination=accountStorageKey(key);
    const current=JSON.parse(localStorage.getItem(destination)||"[]");
    if(!Array.isArray(source)||!Array.isArray(current))throw new Error("旧历史格式无法读取，原始记录未修改。");
    const ids=new Set(current.map(v=>v?.id));
    const fresh=source.filter(v=>v && typeof v.id==="string" && !ids.has(v.id));
    if(fresh.length){localStorage.setItem(destination,JSON.stringify([...current,...fresh]));added+=fresh.length;}
  }
  const available=await indexedDB.databases();
  for(const [name,store] of [["perdesign-local-gallery","generation-batches"],["perdesign-free-chat","history"]]) {
    if(!available.some(db=>db.name===name))continue;
    const source=await open(name,store);const records=await read(source,store);source.close();
    const destination=await open(accountStorageKey(name),store);
    try {
      const existing=await read(destination,store);
      const fresh:any[]=[];
      if(name==="perdesign-free-chat") {
        const oldSessions=records.find(r=>r.id==="sessions")?.value||[];
        const current=existing.find(r=>r.id==="sessions")?.value||[];
        const ids=new Set(current.map((v:any)=>v.id));
        const sessions=oldSessions.filter((v:any)=>v?.id&&!ids.has(v.id));
        if(sessions.length){fresh.push({id:"sessions",value:[...current,...sessions]});added+=sessions.length;}
      } else {
        const ids=new Set(existing.map(v=>v.id));fresh.push(...records.filter(v=>!ids.has(v.id)));added+=fresh.length;
      }
      if(fresh.length)await new Promise<void>((resolve,reject)=>{
        const tx=destination.transaction(store,"readwrite");for(const record of fresh)tx.objectStore(store).put(record);
        tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });
    }finally{destination.close();}
  }
  return added;
}
function open(name:string,store:string) {
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open(name,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(store))req.result.createObjectStore(store,{keyPath:"id"});};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
function read(db:IDBDatabase,store:string) {
  return new Promise<any[]>((resolve,reject)=>{
    if(!db.objectStoreNames.contains(store)){resolve([]);return;}
    const req=db.transaction(store,"readonly").objectStore(store).getAll();
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
