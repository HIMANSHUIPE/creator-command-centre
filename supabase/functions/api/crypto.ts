// AES-256-GCM token encryption. Key = SHA-256(TOKEN_ENCRYPTION_KEY). Output: base64(iv).base64(ct)
const enc = new TextEncoder()
const dec = new TextDecoder()
let keyPromise: Promise<CryptoKey> | null = null

function getKey() {
  const secret = Deno.env.get('TOKEN_ENCRYPTION_KEY')
  if (!secret || secret.length < 32) throw new Error('TOKEN_ENCRYPTION_KEY is missing or shorter than 32 characters')
  keyPromise ??= crypto.subtle.digest('SHA-256', enc.encode(secret)).then((raw) =>
    crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']))
  return keyPromise
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function encrypt(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getKey(), enc.encode(plain)))
  return `${b64(iv)}.${b64(ct)}`
}
export async function decrypt(payload: string) {
  const [iv, ct] = payload.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await getKey(), unb64(ct))
  return dec.decode(pt)
}
