import https from "node:https";
import dns from "node:dns";

const TELEGRAM_HOSTS = new Set(["api.telegram.org", "api.telegram.org."]);
const TELEGRAM_IP = process.env.TELEGRAM_API_IP || "149.154.167.220";

export const telegramAgent = new https.Agent({
  keepAlive: true,
  lookup(hostname, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (TELEGRAM_HOSTS.has(hostname)) {
      if (options?.all) {
        callback(null, [{ address: TELEGRAM_IP, family: 4 }]);
      } else {
        callback(null, TELEGRAM_IP, 4);
      }
      return;
    }
    dns.lookup(hostname, options, callback);
  },
});
