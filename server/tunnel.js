import { spawn } from "child_process";

export function startCloudflareTunnel(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["--yes", "cloudflared", "tunnel", "--url", `http://127.0.0.1:${port}`],
      { shell: true, windowsHide: true }
    );

    let settled = false;
    const buffer = [];

    const onData = (chunk) => {
      const text = chunk.toString();
      buffer.push(text);
      process.stdout.write(text);
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !settled) {
        settled = true;
        resolve({ url: match[0], child });
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`cloudflared exited (${code}): ${buffer.join("")}`));
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error("Не удалось получить публичный URL туннеля за 60 секунд"));
      }
    }, 60_000);
  });
}
