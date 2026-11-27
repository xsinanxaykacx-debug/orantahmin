import { createDecipheriv, createHash } from "node:crypto";

export const IDDAA_CLIENT_ID = "027d808aeb600f930baa00c4583e78ae";
export const IDDAA_SEASON_ID = 143916;
export const IDDAA_UNIQUE_TOURNAMENT_ID = 52;

const LICENSE_URL = `https://widgets.sir.sportradar.com/${IDDAA_CLIENT_ID}/licensing`;
const FEED_BASE = "https://widgets.fn.sportradar.com/common/tr/Etc:UTC/gismo";
const PAGE_URL = "https://www.iddaa.com/lig-analiz/puan-durumu/turkiye-super-lig";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";

let tokenCache = null;

function decryptOpenSslAes(cipherText, passphrase) {
  const input = Buffer.from(cipherText, "base64");
  if (input.length < 32 || input.subarray(0, 8).toString("ascii") !== "Salted__") {
    throw new Error("Sportradar lisans yanıtı beklenen OpenSSL biçiminde değil.");
  }
  const salt = input.subarray(8, 16);
  const encrypted = input.subarray(16);
  const password = Buffer.from(passphrase, "utf8");
  let material = Buffer.alloc(0);
  let previous = Buffer.alloc(0);
  while (material.length < 48) {
    previous = createHash("md5").update(Buffer.concat([previous, password, salt])).digest();
    material = Buffer.concat([material, previous]);
  }
  const decipher = createDecipheriv(
    "aes-256-cbc",
    material.subarray(0, 32),
    material.subarray(32, 48)
  );
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function parseTokenExpiry(token) {
  const match = token.match(/(?:^|~)exp=(\d+)/);
  if (!match) return Date.now() + 4 * 60 * 1000;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds * 1000 : Date.now() + 4 * 60 * 1000;
}

async function getFishnetToken(forceRefresh = false) {
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token;
  }
  const response = await fetch(LICENSE_URL, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://www.iddaa.com",
      Referer: PAGE_URL,
      "User-Agent": UA
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Sportradar lisans servisi HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.valid === false || !payload.text) {
    throw new Error(payload.emsg || "Sportradar lisans verisi alınamadı.");
  }
  const decoded = JSON.parse(decryptOpenSslAes(payload.text, IDDAA_CLIENT_ID));
  const fishnet = decoded.fishnetToken;
  const token = typeof fishnet === "string" ? fishnet : fishnet?.token;
  if (!token || !token.includes("hmac=")) {
    throw new Error("Sportradar fishnet token çözülemedi.");
  }
  tokenCache = {
    token,
    expiresAt: Math.max(Date.now() + 30_000, parseTokenExpiry(token))
  };
  return token;
}

function unwrapFeed(payload, feed) {
  const doc = Array.isArray(payload?.doc) ? payload.doc[0] : null;
  if (!doc) throw new Error(`${feed}: JSON zarfı bulunamadı.`);
  if (doc.event === "exception" || doc.data?._doc === "exception") {
    const code = doc.data?.code || 502;
    const error = new Error(`${feed}: ${doc.data?.message || "Sportradar veri hatası"} (HTTP ${code}).`);
    error.statusCode = Number(code);
    throw error;
  }
  return doc.data;
}

export async function fetchIddaaFeed(feed, params) {
  if (!/^[a-z0-9_]+$/i.test(feed) || !/^[0-9/]+$/.test(String(params))) {
    throw new Error("Geçersiz Sportradar feed parametresi.");
  }
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const token = await getFishnetToken(attempt === 1);
      const url = `${FEED_BASE}/${feed}/${params}?T=${token}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          Origin: "https://www.iddaa.com",
          Referer: PAGE_URL,
          "User-Agent": UA
        },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(`${feed} HTTP ${response.status}.`);
      return unwrapFeed(await response.json(), feed);
    } catch (error) {
      lastError = error;
      const statusCode = error && typeof error === "object" ? error.statusCode : undefined;
      if (
        attempt === 0 &&
        (statusCode === 401 || statusCode === 403 ||
          String(error).includes("HTTP 401") || String(error).includes("HTTP 403"))
      ) {
        tokenCache = null;
        continue;
      }
      break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Sportradar verisi alınamadı.");
}

export function resetIddaaTokenCacheForTests() {
  tokenCache = null;
}

export async function fetchIddaaUpcomingFixtures(seasonId = IDDAA_SEASON_ID) {
  const data = await fetchIddaaFeed("livescore_season_fixtures", seasonId);
  const rawMatches = data?.matches;
  const matches = Array.isArray(rawMatches)
    ? rawMatches
    : rawMatches && typeof rawMatches === "object"
      ? Object.values(rawMatches)
      : [];
  return { ...data, matches };
}
