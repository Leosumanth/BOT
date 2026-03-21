const crypto = require("crypto");

const ENCRYPTION_VERSION = "v1";
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024
};

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function requireEnv(name) {
  const value = process.env[name];
  if (isBlank(value)) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return String(value);
}

function encodeBase64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(String(value), "base64url");
}

function deriveEncryptionKey() {
  return crypto.createHash("sha256").update(requireEnv("ENCRYPTION_KEY")).digest();
}

function encryptSecret(value) {
  if (isBlank(value)) {
    throw new Error("Cannot encrypt an empty secret");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    encodeBase64Url(iv),
    encodeBase64Url(tag),
    encodeBase64Url(ciphertext)
  ].join(".");
}

function decryptSecret(payload) {
  if (isBlank(payload)) {
    throw new Error("Encrypted secret payload is missing");
  }

  const [version, ivValue, tagValue, ciphertextValue] = String(payload).split(".");
  if (version !== ENCRYPTION_VERSION || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Encrypted secret payload is invalid");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(),
    decodeBase64Url(ivValue)
  );
  decipher.setAuthTag(decodeBase64Url(tagValue));

  const plaintext = Buffer.concat([
    decipher.update(decodeBase64Url(ciphertextValue)),
    decipher.final()
  ]);

  return plaintext.toString("utf8");
}

function hashPassword(password) {
  if (isBlank(password)) {
    throw new Error("Password cannot be empty");
  }

  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, 64, SCRYPT_OPTIONS);
  return `scrypt.${encodeBase64Url(salt)}.${encodeBase64Url(derived)}`;
}

function verifyPassword(password, storedHash) {
  if (isBlank(password) || isBlank(storedHash)) {
    return false;
  }

  const [algorithm, saltValue, derivedValue] = String(storedHash).split(".");
  if (algorithm !== "scrypt" || !saltValue || !derivedValue) {
    return false;
  }

  try {
    const expected = decodeBase64Url(derivedValue);
    const actual = crypto.scryptSync(String(password), decodeBase64Url(saltValue), expected.length, SCRYPT_OPTIONS);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

module.exports = {
  decryptSecret,
  encryptSecret,
  generateSessionToken,
  hashPassword,
  hashToken,
  isBlank,
  verifyPassword
};
