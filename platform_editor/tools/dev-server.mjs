import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSET_CATEGORIES,
  ASSET_MIME_TYPES,
  AssetStorageError,
  deleteAsset,
  getAssetCategory,
  listAssets,
  MAX_ASSET_BYTES,
  renameAsset,
  saveAsset,
  updateAssetMetadata
} from "./asset-storage.mjs";
import { importBackgroundToGame } from "./background-import.mjs";
import {
  buildTiledMapBundle,
  normalizeTiledFilePath
} from "./tiled-map-import.mjs";
import {
  deleteTiledMapAsset,
  getTiledMapNameConflicts,
  importTiledMapToGame,
  listTiledMapAssets,
  publishTiledMapBundle,
  renameTiledMapAsset
} from "./tiled-asset-repository.mjs";
import {
  normalizeLevel,
  validateLevel
} from "../src/contract/index.js";

/**
 * 地图编辑器本地服务。
 *
 * 静态文件来自当前 platform_editor 工程；项目 API 读取和写入
 * 兄弟目录 platform_dome 中的角色、道具和关卡 JSON。
 */
const editorRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contractRoot = resolve(editorRoot, "..", "platform_contract");
const gameRoot = resolve(
  process.env.PLATFORM_DOME_PATH ??
    join(editorRoot, "..", "platform_dome")
);
const levelDirectory = join(gameRoot, "data", "levels");
const configDirectory = join(gameRoot, "data", "configs");
const manifestPath = join(levelDirectory, "manifest.json");
const backupsDirectory = join(editorRoot, ".editor-backups");
const tiledImportsDirectory = join(
  editorRoot,
  ".tiled-import-staging"
);
const assetRoot = join(editorRoot, "assets");
const configuredPort = Number(process.env.PORT ?? 8090);
const levelIdPattern = /^[a-z0-9][a-z0-9-]{1,63}$/;
const maxBodyBytes = 3 * 1024 * 1024;

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
  ".woff2": "font/woff2",
  ...ASSET_MIME_TYPES
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readOptionalJson(filePath, fallback) {
  try {
    return await readJsonFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      throw new Error("请求内容过大");
    }
    chunks.push(chunk);
  }

  if (size === 0) {
    throw new Error("请求内容为空");
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readBinaryBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_ASSET_BYTES) {
      throw new AssetStorageError(
        413,
        "单个素材不能超过 20 MB"
      );
    }
    chunks.push(chunk);
  }

  if (size === 0) {
    throw new AssetStorageError(400, "上传文件为空");
  }

  return Buffer.concat(chunks);
}

function getAssetUrl(asset) {
  return getRelativeAssetUrl(asset.relativePath);
}

function getRelativeAssetUrl(relativePath) {
  return `/assets/${relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

async function getAssetSnapshot() {
  const loadedCategories = await Promise.all(
    ASSET_CATEGORIES.flatMap((group) =>
      group.children.map(async (category) => ({
        category,
        assets:
          category.id === "tiled"
            ? await listTiledMapAssets(assetRoot)
            : await listAssets(assetRoot, category.id)
      }))
    )
  );
  const assets = {};

  for (const entry of loadedCategories) {
    assets[entry.category.id] = entry.assets.map((asset) => {
      if (entry.category.id !== "tiled") {
        return { ...asset, url: getAssetUrl(asset) };
      }
      const version = asset.revision
        ? `?v=${encodeURIComponent(asset.revision)}`
        : "";
      return {
        ...asset,
        url: getAssetUrl(asset),
        mapUrl: `${getRelativeAssetUrl(
          `${asset.relativePath}/${asset.mapPath}`
        )}${version}`,
        tilesets: (asset.tilesets ?? []).map((tileset) => ({
          ...tileset,
          url: `${getRelativeAssetUrl(
            `${asset.relativePath}/${tileset.imagePath}`
          )}${version}`
        }))
      };
    });
  }

  return {
    storageRoot: assetRoot,
    maxFileBytes: MAX_ASSET_BYTES,
    categories: ASSET_CATEGORIES.map((group) => ({
      id: group.id,
      label: group.label,
      children: group.children.map((category) => ({
        id: category.id,
        label: category.label,
        allowedExtensions:
          category.allowedExtensions ??
          Object.keys(ASSET_MIME_TYPES)
      }))
    })),
    assets
  };
}

async function collectStagedFiles(directory, relativeDirectory = "") {
  const entries = await readdir(join(directory, relativeDirectory), {
    withFileTypes: true
  });
  const files = [];
  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    if (entry.isDirectory()) {
      files.push(
        ...(await collectStagedFiles(directory, relativePath))
      );
    } else if (entry.isFile()) {
      files.push({
        path: relativePath,
        content: await readFile(
          join(directory, ...relativePath.split("/"))
        )
      });
    }
  }
  return files;
}

function getTiledImportDirectory(importId) {
  if (!/^[a-f0-9-]{36}$/i.test(importId)) {
    throw new AssetStorageError(400, "Tiled 导入批次 ID 不合法");
  }
  return join(tiledImportsDirectory, importId);
}

async function validateAndMigrateLevel(level, routeId) {
  const normalized = normalizeLevel(level);
  if (normalized.id !== routeId) {
    throw new Error("URL 中的关卡 id 与 JSON 内的 id 不一致");
  }
  const [actors, items, knownLevels] = await Promise.all([
    readJsonFile(join(configDirectory, "actors.json")),
    readJsonFile(join(configDirectory, "items.json")),
    listLevels()
  ]);
  const issues = validateLevel(normalized, {
    catalogs: { actors, items },
    knownLevels: [
      ...knownLevels.filter((known) => known.id !== normalized.id),
      normalized
    ]
  });
  const errors = issues.filter(
    (issue) => issue.severity === "error"
  );
  if (errors.length > 0) {
    throw new Error(
      errors.map((issue) => issue.message).join("；")
    );
  }
  return normalized;
}

async function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(temporaryPath, body, "utf8");
  await rename(temporaryPath, filePath);
}

async function createBackup(levelId) {
  const sourcePath = join(levelDirectory, `${levelId}.json`);
  try {
    const existing = await readFile(sourcePath, "utf8");
    await mkdir(backupsDirectory, { recursive: true });
    const stamp = new Date()
      .toISOString()
      .replaceAll(":", "-")
      .replaceAll(".", "-");
    const backupPath = join(
      backupsDirectory,
      `${levelId}-${stamp}.json`
    );
    await writeFile(backupPath, existing, "utf8");
    return backupPath;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function listLevels() {
  const entries = await readdir(levelDirectory, { withFileTypes: true });
  const levels = [];

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      extname(entry.name) !== ".json" ||
      entry.name === "manifest.json"
    ) {
      continue;
    }

    try {
      const level = await readJsonFile(join(levelDirectory, entry.name));
      if (!level?.id) {
        continue;
      }
      levels.push({
        id: level.id,
        name: level.name ?? level.id,
        filename: entry.name,
        width: level.world?.width ?? 0,
        height: level.world?.height ?? 0,
        spawnPoints: (level.spawnPoints ?? []).map((spawn) => ({
          id: spawn.id,
          name: spawn.name ?? spawn.id
        })),
        mechanisms: level.mechanisms ?? []
      });
    } catch {
      // 单个损坏的关卡不应阻止编辑器启动。
    }
  }

  levels.sort((a, b) => a.id.localeCompare(b.id, "zh-CN"));
  return levels;
}

async function getProjectSnapshot() {
  const [actors, items, levels, manifest] = await Promise.all([
    readJsonFile(join(configDirectory, "actors.json")),
    readJsonFile(join(configDirectory, "items.json")),
    listLevels(),
    readOptionalJson(manifestPath, { levels: [] })
  ]);

  return {
    gameRoot,
    levelDirectory,
    levels,
    manifest,
    configs: {
      actors,
      items
    }
  };
}

async function handleApi(request, response, requestUrl) {
  const { pathname } = requestUrl;

  if (
    pathname === "/api/backgrounds/import" &&
    request.method === "POST"
  ) {
    try {
      const body = await readRequestBody(request);
      if (body.kind === "tiled-map") {
        const background = await importTiledMapToGame({
          assetRoot,
          gameRoot,
          assetId: body.assetId
        });
        sendJson(response, 200, {
          ok: true,
          background
        });
        return true;
      }
      const background = await importBackgroundToGame({
        assetRoot,
        gameRoot,
        assetId: body.assetId
      });
      sendJson(response, 200, {
        ok: true,
        background
      });
    } catch (error) {
      sendJson(response, error.statusCode ?? 400, {
        error: error.message
      });
    }
    return true;
  }

  if (pathname === "/api/backgrounds/import") {
    sendJson(response, 405, { error: "不支持的请求方法" });
    return true;
  }

  if (
    pathname === "/api/tiled-maps/imports" &&
    request.method === "POST"
  ) {
    const importId = randomUUID();
    await mkdir(getTiledImportDirectory(importId), {
      recursive: true
    });
    sendJson(response, 201, { ok: true, importId });
    return true;
  }

  const tiledImportFilesMatch = pathname.match(
    /^\/api\/tiled-maps\/imports\/([a-f0-9-]{36})\/files$/
  );
  if (tiledImportFilesMatch && request.method === "PUT") {
    try {
      const importDirectory = getTiledImportDirectory(
        tiledImportFilesMatch[1]
      );
      const relativePath = normalizeTiledFilePath(
        requestUrl.searchParams.get("path") ?? ""
      );
      const content = await readBinaryBody(request);
      const outputPath = resolve(
        importDirectory,
        ...relativePath.split("/")
      );
      if (
        outputPath !== importDirectory &&
        !outputPath.startsWith(`${importDirectory}${sep}`)
      ) {
        throw new AssetStorageError(400, "Tiled 文件路径不合法");
      }
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, content);
      sendJson(response, 200, {
        ok: true,
        path: relativePath,
        size: content.length
      });
    } catch (error) {
      sendJson(response, error.statusCode ?? 400, {
        error: error.message
      });
    }
    return true;
  }

  const tiledImportCompleteMatch = pathname.match(
    /^\/api\/tiled-maps\/imports\/([a-f0-9-]{36})\/complete$/
  );
  if (tiledImportCompleteMatch && request.method === "POST") {
    let importDirectory = null;
    const publishedAssetIds = [];
    try {
      importDirectory = getTiledImportDirectory(
        tiledImportCompleteMatch[1]
      );
      const body = await readRequestBody(request);
      const files = await collectStagedFiles(importDirectory);
      const mapPaths = Array.isArray(body.mapPaths)
        ? [...new Set(body.mapPaths.map(String))]
        : [];
      if (mapPaths.length === 0) {
        throw new AssetStorageError(
          400,
          "请选择至少一个要导入的 JSON/TMJ 地图"
        );
      }
      const bundles = mapPaths.map((mapPath) =>
        buildTiledMapBundle({ files, mapPath })
      );
      const bundleNames = bundles.map(
        (bundle) => bundle.manifest.name.toLowerCase()
      );
      if (new Set(bundleNames).size !== bundleNames.length) {
        throw new AssetStorageError(
          400,
          "所选 Tiled 地图中存在同名文件，请分批导入"
        );
      }
      const conflicts = await getTiledMapNameConflicts(
        assetRoot,
        bundles
      );
      const overwriteNames = new Set(
        Array.isArray(body.overwriteNames)
          ? body.overwriteNames.map((name) =>
              String(name).toLowerCase()
            )
          : []
      );
      const unresolvedConflicts = conflicts.filter(
        (conflict) =>
          !overwriteNames.has(conflict.name.toLowerCase())
      );
      if (unresolvedConflicts.length > 0) {
        sendJson(response, 409, {
          ok: false,
          code: "TILED_NAME_CONFLICT",
          error: `素材库中已存在同名 Tiled 地图：${unresolvedConflicts
            .map((conflict) => conflict.name)
            .join("、")}`,
          conflicts: unresolvedConflicts
        });
        return true;
      }
      const assets = [];
      for (const bundle of bundles) {
        const asset = await publishTiledMapBundle({
          assetRoot,
          bundle,
          overwrite: overwriteNames.has(
            bundle.manifest.name.toLowerCase()
          )
        });
        assets.push(asset);
        publishedAssetIds.push(asset.id);
      }
      await rm(importDirectory, {
        recursive: true,
        force: true
      });
      sendJson(response, 201, { ok: true, assets });
    } catch (error) {
      for (const assetId of publishedAssetIds) {
        await deleteTiledMapAsset(assetRoot, assetId).catch(
          () => {}
        );
      }
      if (importDirectory) {
        await rm(importDirectory, {
          recursive: true,
          force: true
        }).catch(() => {});
      }
      sendJson(response, error.statusCode ?? 400, {
        error: error.message
      });
    }
    return true;
  }

  const tiledImportMatch = pathname.match(
    /^\/api\/tiled-maps\/imports\/([a-f0-9-]{36})$/
  );
  if (tiledImportMatch && request.method === "DELETE") {
    try {
      await rm(getTiledImportDirectory(tiledImportMatch[1]), {
        recursive: true,
        force: true
      });
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, error.statusCode ?? 400, {
        error: error.message
      });
    }
    return true;
  }

  if (
    pathname.startsWith("/api/tiled-maps/imports") &&
    !tiledImportFilesMatch &&
    !tiledImportCompleteMatch &&
    !tiledImportMatch
  ) {
    sendJson(response, 405, { error: "不支持的 Tiled 导入请求" });
    return true;
  }

  if (pathname === "/api/assets" && request.method === "GET") {
    sendJson(response, 200, await getAssetSnapshot());
    return true;
  }

  if (pathname === "/api/assets" && request.method === "POST") {
    try {
      const categoryId =
        requestUrl.searchParams.get("category") ?? "";
      const fileName =
        requestUrl.searchParams.get("filename") ?? "";
      const category = getAssetCategory(categoryId);
      const content = await readBinaryBody(request);
      const asset = await saveAsset(assetRoot, {
        categoryId,
        fileName,
        contentType: request.headers["content-type"],
        content
      });

      sendJson(response, 201, {
        ok: true,
        asset: {
          ...asset,
          url: getAssetUrl(asset),
          categoryLabel: category.label
        }
      });
    } catch (error) {
      sendJson(response, error.statusCode ?? 400, {
        error: error.message
      });
    }
    return true;
  }

  if (pathname === "/api/assets" && request.method === "DELETE") {
    try {
      const categoryId =
        requestUrl.searchParams.get("category") ?? "";
      const fileName =
        requestUrl.searchParams.get("filename") ?? "";
      if (categoryId === "tiled") {
        const deleted = await deleteTiledMapAsset(
          assetRoot,
          requestUrl.searchParams.get("assetId") ?? ""
        );
        sendJson(response, 200, { ok: true, deleted });
        return true;
      }
      const deleted = await deleteAsset(assetRoot, {
        categoryId,
        fileName
      });
      sendJson(response, 200, {
        ok: true,
        deleted
      });
    } catch (error) {
      sendJson(response, error.statusCode ?? 400, {
        error: error.message
      });
    }
    return true;
  }

  if (pathname === "/api/assets" && request.method === "PATCH") {
    try {
      const categoryId =
        requestUrl.searchParams.get("category") ?? "";
      const fileName =
        requestUrl.searchParams.get("filename") ?? "";
      const body = await readRequestBody(request);
      if (body.action === "rename") {
        if (categoryId === "tiled") {
          const renamed = await renameTiledMapAsset(assetRoot, {
            assetId: body.assetId ?? fileName,
            newName: body.newFileName
          });
          sendJson(response, 200, { ok: true, renamed });
          return true;
        }
        const renamed = await renameAsset(assetRoot, {
          categoryId,
          fileName,
          newFileName: body.newFileName
        });
        sendJson(response, 200, {
          ok: true,
          renamed
        });
        return true;
      }
      if (body.action && body.action !== "frame-rate") {
        throw new AssetStorageError(400, "不支持的素材操作");
      }
      const metadata = await updateAssetMetadata(assetRoot, {
        categoryId,
        fileName,
        frameRate: body.frameRate
      });
      sendJson(response, 200, {
        ok: true,
        metadata
      });
    } catch (error) {
      sendJson(response, error.statusCode ?? 400, {
        error: error.message
      });
    }
    return true;
  }

  if (pathname === "/api/assets") {
    sendJson(response, 405, { error: "不支持的请求方法" });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/project") {
    sendJson(response, 200, await getProjectSnapshot());
    return true;
  }

  if (request.method === "GET" && pathname === "/api/levels") {
    sendJson(response, 200, {
      levels: await listLevels(),
      manifest: await readOptionalJson(manifestPath, { levels: [] })
    });
    return true;
  }

  const levelMatch = pathname.match(/^\/api\/levels\/([a-z0-9-]+)$/);
  if (!levelMatch) {
    return false;
  }

  const levelId = levelMatch[1];
  if (!levelIdPattern.test(levelId)) {
    sendJson(response, 400, { error: "关卡 id 不合法" });
    return true;
  }

  if (request.method === "GET") {
    try {
      const level = await readJsonFile(
        join(levelDirectory, `${levelId}.json`)
      );
      sendJson(response, 200, { level: normalizeLevel(level) });
    } catch (error) {
      sendJson(response, error.code === "ENOENT" ? 404 : 500, {
        error:
          error.code === "ENOENT"
            ? `找不到关卡 ${levelId}`
            : error.message
      });
    }
    return true;
  }

  if (request.method === "PUT") {
    try {
      const level = await validateAndMigrateLevel(
        await readRequestBody(request),
        levelId
      );
      const backupPath = await createBackup(levelId);
      await atomicWriteJson(
        join(levelDirectory, `${levelId}.json`),
        level
      );

      const levels = await listLevels();
      const manifest = await readOptionalJson(manifestPath, {
        levels: []
      });
      manifest.levels = levels.map((entry) => entry.id);
      await atomicWriteJson(manifestPath, manifest);

      sendJson(response, 200, {
        ok: true,
        levelId,
        savedTo: join(levelDirectory, `${levelId}.json`),
        backupPath,
        levels
      });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  sendJson(response, 405, { error: "不支持的请求方法" });
  return true;
}

async function serveStatic(response, pathname) {
  try {
    const decodedPath = decodeURIComponent(
      pathname === "/" ? "/index.html" : pathname
    );
    const isContractRequest =
      decodedPath === "/platform_contract" ||
      decodedPath.startsWith("/platform_contract/");
    const isGameAssetRequest =
      decodedPath.startsWith("/game/assets/");
    const staticRoot = isContractRequest
      ? contractRoot
      : isGameAssetRequest
        ? gameRoot
        : editorRoot;
    const relativePath = isContractRequest
      ? decodedPath.slice("/platform_contract".length) || "/"
      : isGameAssetRequest
        ? decodedPath.slice("/game".length)
        : decodedPath;
    const filePath = resolve(staticRoot, `.${relativePath}`);

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
    const headers = {
      "Content-Type":
        mimeTypes[extname(filePath).toLowerCase()] ??
        "application/octet-stream",
      "Cache-Control": "no-store"
    };
    if (
      filePath === assetRoot ||
      filePath.startsWith(`${assetRoot}${sep}`)
    ) {
      headers["X-Content-Type-Options"] = "nosniff";
      headers["Content-Security-Policy"] = "sandbox";
    }
    response.writeHead(200, headers);
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not Found");
  }
}

async function handleRequest(request, response) {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    if (requestUrl.pathname.startsWith("/api/")) {
      const handled = await handleApi(
        request,
        response,
        requestUrl
      );
      if (!handled) {
        sendJson(response, 404, { error: "未知 API 路径" });
      }
      return;
    }

    await serveStatic(response, requestUrl.pathname);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendJson(response, 500, { error: "服务器内部错误" });
    } else {
      response.end();
    }
  }
}

function listenWithFallback(port, remainingAttempts = 10) {
  const server = createServer(handleRequest);

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && remainingAttempts > 0) {
      console.warn(`端口 ${port} 已被占用，尝试 ${port + 1}……`);
      listenWithFallback(port + 1, remainingAttempts - 1);
      return;
    }
    console.error("编辑器服务器启动失败：", error);
    process.exitCode = 1;
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`地图编辑器已启动：http://127.0.0.1:${port}`);
    console.log(`游戏项目：${gameRoot}`);
    console.log(`关卡目录：${levelDirectory}`);
    console.log("按 Ctrl+C 停止服务器。");
  });
}

listenWithFallback(configuredPort);
