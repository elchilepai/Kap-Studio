import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";

/** Hash de contraseñas con scrypt (memoria-dura, incluido en Node; sin dependencias nativas). */
const N = 32768, R = 8, P = 1, KEYLEN = 64, MAXMEM = 128 * 1024 * 1024;

const scrypt = (pw: string, salt: Buffer, n: number, r: number, p: number, len: number) =>
  new Promise<Buffer>((res, rej) => _scrypt(pw.normalize("NFKC"), salt, len, { N: n, r, p, maxmem: MAXMEM }, (e, k) => (e ? rej(e) : res(k))));

/** Formato: scrypt$N$r$p$salt(b64)$hash(b64). Los parámetros viajan con el hash para poder subirlos en el futuro. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N, R, P, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, "base64");
    const key = await scrypt(password, Buffer.from(salt, "base64"), +n, +r, +p, expected.length);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch { return false; }
}

/** Hash de relleno: se verifica cuando el usuario no existe para que el tiempo de respuesta no lo delate. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString("hex")));

export const MIN_PASSWORD = 12;
export function passwordProblem(password: string, username = ""): string | null {
  if (password.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`;
  if (password.length > 200) return "La contraseña es demasiado larga (máximo 200)";
  if (username && password.toLowerCase().includes(username.toLowerCase())) return "La contraseña no puede contener el nombre de usuario";
  if (/^(.)\1+$/.test(password)) return "La contraseña no puede ser un solo carácter repetido";
  return null;
}

export const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;
export const normalizeUsername = (u: string) => u.trim().toLowerCase();
