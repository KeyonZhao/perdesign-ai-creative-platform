let accountId = "";
export function setStorageAccount(id: string) { accountId = id; }
export function accountStorageKey(key: string) {
  if (!accountId) throw new Error("请先登录后读取个人数据。");
  return `pinwu-user:${accountId}:${key}`;
}
export const scopedStorage = {
  getItem: (key:string) => localStorage.getItem(accountStorageKey(key)),
  setItem: (key:string,value:string) => localStorage.setItem(accountStorageKey(key),value),
  removeItem: (key:string) => localStorage.removeItem(accountStorageKey(key))
};
