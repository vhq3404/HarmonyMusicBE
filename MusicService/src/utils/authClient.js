const axios = require("axios");

/* Simple in-memory TTL cache — avoids N+1 calls to AuthService */
const cache    = new Map();
const TTL_MS   = 5 * 60 * 1000; // 5 minutes
const MAX_SIZE = 2_000;          // evict oldest when cache exceeds this

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}

function setInCache(key, data) {
  if (cache.size >= MAX_SIZE) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

/* Periodically evict stale entries so the Map doesn't grow unbounded */
const evictionTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) cache.delete(key);
  }
}, 10 * 60 * 1000);
evictionTimer.unref(); /* don't keep the process alive */

const authAxios = axios.create({
  baseURL: process.env.AUTH_SERVICE_URL,
  timeout: 5000,
});

/* In-flight deduplication: prevents thundering herd when the same userId's cache expires
   and multiple concurrent requests race to fetch from AuthService simultaneously */
const inFlight = new Map();

exports.getUserById = async (userId) => {
  const cached = getFromCache(userId);
  if (cached) return cached;

  if (inFlight.has(userId)) return inFlight.get(userId);

  const promise = authAxios.get(`/api/users/${userId}`)
    .then((res) => {
      const user = res.data.user;
      setInCache(userId, user);
      return user;
    })
    .finally(() => inFlight.delete(userId));

  inFlight.set(userId, promise);
  return promise;
};

/* Invalidate a user's cached entry when their profile changes */
exports.invalidateUser = (userId) => cache.delete(userId);
