
  const fs = require('fs');
  const path = require('path');

  // Write a minimal ZIP file using pure Node.js
  function crc32(buf) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function writeUInt16LE(val) {
    const b = Buffer.alloc(2); b.writeUInt16LE(val); return b;
  }
  function writeUInt32LE(val) {
    const b = Buffer.alloc(4); b.writeUInt32LE(val >>> 0); return b;
  }

  const entries = [];
  const centralDir = [];

  function addFile(zipPath, filePath) {
    const data = fs.readFileSync(filePath);
    const nameBytes = Buffer.from(zipPath);
    const crc = crc32(data);
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear()-1980) << 9) | ((now.getMonth()+1) << 5) | now.getDate();
    
    const localHeader = Buffer.concat([
      Buffer.from([0x50,0x4B,0x03,0x04]), // sig
      writeUInt16LE(20), // version needed
      writeUInt16LE(0),  // flags
      writeUInt16LE(0),  // compression (store)
      writeUInt16LE(dosTime),
      writeUInt16LE(dosDate),
      writeUInt32LE(crc),
      writeUInt32LE(data.length),
      writeUInt32LE(data.length),
      writeUInt16LE(nameBytes.length),
      writeUInt16LE(0),  // extra length
      nameBytes
    ]);
    
    entries.push({localHeader, data, nameBytes, crc, size: data.length, dosTime, dosDate});
  }

  // Walk directory
  function walk(dir, base) {
    for (const f of fs.readdirSync(dir)) {
      if (f === '.DS_Store') continue;
      const full = path.join(dir, f);
      const rel = path.join(base, f);
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else addFile(rel, full);
    }
  }

  walk('pharma-dist', 'pharma-dist');

  // Build zip
  const parts = [];
  let offset = 0;
  for (const e of entries) {
    e.offset = offset;
    parts.push(e.localHeader);
    parts.push(e.data);
    offset += e.localHeader.length + e.data.length;
  }

  // Central directory
  let cdOffset = offset;
  for (const e of entries) {
    const cd = Buffer.concat([
      Buffer.from([0x50,0x4B,0x01,0x02]),
      writeUInt16LE(20), writeUInt16LE(20),
      writeUInt16LE(0), writeUInt16LE(0),
      writeUInt16LE(e.dosTime), writeUInt16LE(e.dosDate),
      writeUInt32LE(e.crc),
      writeUInt32LE(e.size), writeUInt32LE(e.size),
      writeUInt16LE(e.nameBytes.length),
      writeUInt16LE(0), writeUInt16LE(0), writeUInt16LE(0), writeUInt16LE(0),
      writeUInt32LE(0),
      writeUInt32LE(e.offset),
      e.nameBytes
    ]);
    parts.push(cd);
    offset += cd.length;
  }

  const cdSize = offset - cdOffset;

  // End of central dir
  const eocd = Buffer.concat([
    Buffer.from([0x50,0x4B,0x05,0x06]),
    writeUInt16LE(0), writeUInt16LE(0),
    writeUInt16LE(entries.length), writeUInt16LE(entries.length),
    writeUInt32LE(cdSize),
    writeUInt32LE(cdOffset),
    writeUInt16LE(0)
  ]);
  parts.push(eocd);

  fs.writeFileSync('pharma-arena.zip', Buffer.concat(parts));
  console.log('ZIP created:', fs.statSync('pharma-arena.zip').size, 'bytes');
  