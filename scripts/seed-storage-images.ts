// Local only: uploads placeholder images to the storage paths supabase/seed.sql points at (payment
// QR images and Haven Spa's logo), since SQL cannot put files in storage. Run after
// `supabase db reset`. It reads the local API URL and service key from `supabase status`.

import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";

type SeedImage = { bucket: "payment-qr" | "shop-media"; path: string; color: [number, number, number] };

const seedImages: SeedImage[] = [
  {
    bucket: "payment-qr",
    path: "20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/seed-qr.png",
    color: [28, 25, 23],
  },
  {
    bucket: "payment-qr",
    path: "20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000002/seed-qr.png",
    color: [28, 25, 23],
  },
  {
    bucket: "payment-qr",
    path: "20000000-0000-0000-0000-000000000002/30000000-0000-0000-0000-000000000003/seed-qr.png",
    color: [28, 25, 23],
  },
  { bucket: "shop-media", path: "20000000-0000-0000-0000-000000000001/logo/seed-logo.png", color: [15, 118, 110] },
];

function readLocalStatus(): { apiUrl: string; serviceKey: string } {
  const output = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
  const values = Object.fromEntries(
    output
      .split("\n")
      .map((line) => /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim()))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => [match[1], match[2]]),
  );
  const apiUrl = values.API_URL;
  const serviceKey = values.SECRET_KEY || values.SERVICE_ROLE_KEY;
  if (!apiUrl || !serviceKey) throw new Error("`supabase status` did not report the local API URL and service key.");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(apiUrl)) throw new Error(`Refusing to upload to a non-local API: ${apiUrl}`);
  return { apiUrl, serviceKey };
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

// A 160 × 160 checkerboard in `color` and white, so a placeholder QR reads as one.
function checkerboardPng(color: [number, number, number]): Buffer {
  const size = 160;
  const cell = 16;
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x += 1) {
      const dark = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const [red, green, blue] = dark ? color : [255, 255, 255];
      row.set([red, green, blue], 1 + x * 3);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const { apiUrl, serviceKey } = readLocalStatus();
for (const image of seedImages) {
  const response = await fetch(`${apiUrl}/storage/v1/object/${image.bucket}/${image.path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "image/png",
      "x-upsert": "true",
    },
    body: checkerboardPng(image.color),
  });
  if (!response.ok) throw new Error(`Uploading ${image.bucket}/${image.path} failed with ${response.status}.`);
  console.log(`Uploaded ${image.bucket}/${image.path}`);
}
