const storage = new Promise((resolve, reject) => {
  const request = indexedDB.open('cia2-study-desk', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('files');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function storedGet(name) {
  const db = await storage;
  return new Promise((resolve, reject) => {
    const request = db.transaction('files').objectStore('files').get(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storedPut(entries) {
  const db = await storage;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    const store = transaction.objectStore('files');
    for (const [name, value] of entries) store.put(value, name);
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}

const imagePattern = /^images\/[\w .()-]+\.(?:png|jpe?g|gif|webp)$/i;
export const isImage = value => typeof value === 'string' && imagePattern.test(value);

export function parseQuestions(content) {
  const rows = JSON.parse(content.replace(/^\uFEFF/, ''));
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 12000) throw new Error('Choose a Part 2 question bank JSON.');
  const ids = new Set();
  for (const q of rows) {
    if (!q || q.type !== 'single_choice' || typeof q.id !== 'string' || ids.has(q.id) ||
        !Number.isInteger(q.unit_number) || q.unit_number < 1 || q.unit_number > 14 ||
        !Number.isInteger(q.subunit_number) || ![q.question, q.unit_title, q.subunit_title].every(v => typeof v === 'string' && v.trim()) ||
        typeof (q.context ?? '') !== 'string' || !['A','B','C','D'].includes(q.correct_answer) ||
        !['A','B','C','D'].every(k => typeof q.options?.[k] === 'string' && q.options[k].trim()) ||
        (q.images != null && (!Array.isArray(q.images) || !q.images.every(isImage)))) {
      throw new Error('Invalid Part 2 question or duplicate question ID.');
    }
    ids.add(q.id);
  }
  return rows;
}

const imageType = name => ({png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp'})[name.split('.').at(-1).toLowerCase()];
export async function readImport(files) {
  const entries = new Map();
  const take = (name, bytes) => {
    if (name.toLowerCase().endsWith('.json')) {
      const questions = parseQuestions(new TextDecoder().decode(bytes));
      if (entries.has('questions')) throw new Error('Import one question bank at a time.');
      entries.set('questions', questions);
    } else if (isImage(name)) entries.set(name, new Blob([bytes], {type:imageType(name)}));
  };
  for (const file of files) {
    if (file.size > 30 * 1024 * 1024) throw new Error('Each import file must be under 30 MB.');
    if (/\.zip$/i.test(file.name)) {
      for (const [name, bytes] of await unpackZip(await file.arrayBuffer())) take(name, bytes);
    } else {
      const name = /\.json$/i.test(file.name) ? file.name : 'images/' + file.name;
      take(name, await file.arrayBuffer());
    }
  }
  if (!entries.size) throw new Error('No question bank or supported images were found.');
  return entries;
}

async function unpackZip(buffer) {
  const zip = new DataView(buffer);
  const u16 = n => zip.getUint16(n, true);
  const u32 = n => zip.getUint32(n, true);
  let end = buffer.byteLength - 22;
  while (end >= Math.max(0, buffer.byteLength - 65557) && u32(end) !== 0x06054b50) end--;
  if (end < 0 || end < buffer.byteLength - 65557) throw new Error('This file is not a supported ZIP.');
  if (u16(end + 4) || u16(end + 6)) throw new Error('Multi-part ZIP files are unsupported.');
  const count = u16(end + 10);
  if (count > 300) throw new Error('This ZIP has too many files.');
  let entry = u32(end + 16);
  let expanded = 0;
  const result = new Map();
  for (let index = 0; index < count; index++) {
    if (entry + 46 > end || u32(entry) !== 0x02014b50) throw new Error('The ZIP directory is damaged.');
    const flags = u16(entry + 8), method = u16(entry + 10), size = u32(entry + 20), expected = u32(entry + 24);
    const length = u16(entry + 28), offset = u32(entry + 42);
    const next = entry + 46 + length + u16(entry + 30) + u16(entry + 32);
    if (next > end) throw new Error('The ZIP directory is incomplete.');
    const name = new TextDecoder().decode(new Uint8Array(buffer, entry + 46, length));
    entry = next;
    if (!/^[\w .()-]+\.json$/i.test(name) && !isImage(name)) continue;
    if ((flags & 1) || ![0,8].includes(method) || offset + 30 >= end || u32(offset) !== 0x04034b50) throw new Error('The ZIP uses unsupported compression or encryption.');
    const start = offset + 30 + u16(offset + 26) + u16(offset + 28);
    expanded += expected;
    if (start + size > end || expanded > 45 * 1024 * 1024) throw new Error('The ZIP exceeds the import limit or is damaged.');
    const bytes = new Uint8Array(buffer, start, size);
    let content = bytes;
    if (method === 8) {
      if (!('DecompressionStream' in window)) throw new Error('Unzip the package and import the JSON and images separately.');
      const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks = [];
      let written = 0;
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        written += value.length;
        if (written > expected) { await reader.cancel(); throw new Error('A ZIP file exceeds its declared size.'); }
        chunks.push(value);
      }
      content = new Uint8Array(written);
      let position = 0;
      for (const chunk of chunks) { content.set(chunk, position); position += chunk.length; }
    }
    if (content.byteLength !== expected || result.has(name)) throw new Error('The ZIP contains incomplete or duplicate files.');
    result.set(name, content);
  }
  return result;
}
