import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 零依赖静态服务器。
 *
 * 浏览器的 ES Modules 需要通过 HTTP 加载，不能稳定地直接 file:// 打开。
 * 这个服务器只用于本地开发，不参与游戏最终运行逻辑。
 */
const projectRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);
const contractRoot = resolve(projectRoot, "..", "platform_contract");
const configuredPort = Number(process.env.PORT ?? 8081);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".woff2": "font/woff2"
};

async function handleRequest(request, response) {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const pathname =
      requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
    const decodedPath = decodeURIComponent(pathname);
    const isContractRequest =
      decodedPath === "/platform_contract" ||
      decodedPath.startsWith("/platform_contract/");
    const staticRoot = isContractRequest ? contractRoot : projectRoot;
    const relativePath = isContractRequest
      ? decodedPath.slice("/platform_contract".length) || "/"
      : decodedPath;
    const filePath = resolve(staticRoot, `.${relativePath}`);

    // 阻止 ../ 形式越过项目根目录读取文件。
    if (
      filePath !== staticRoot &&
      !filePath.startsWith(`${staticRoot}${sep}`)
    ) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      response.writeHead(404);
      response.end("Not Found");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type":
        mimeTypes[extname(filePath).toLowerCase()] ??
        "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not Found");
  }
}

/**
 * 端口被占用时自动向后寻找可用端口。
 * 这样即使本机已有其他开发服务器占用 8081，也不需要手工改配置。
 */
function listenWithFallback(port, remainingAttempts = 10) {
  const server = createServer(handleRequest);

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && remainingAttempts > 0) {
      console.warn(`端口 ${port} 已被占用，尝试 ${port + 1}……`);
      listenWithFallback(port + 1, remainingAttempts - 1);
      return;
    }

    console.error("本地服务器启动失败：", error);
    process.exitCode = 1;
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`游戏已启动：http://127.0.0.1:${port}`);
    console.log("按 Ctrl+C 停止服务器。");
  });
}

listenWithFallback(configuredPort);
