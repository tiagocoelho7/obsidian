"use strict";

const {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  normalizePath,
  requestUrl,
} = require("obsidian");

const UPDATER_ID = "tiago7-plugin-updater-plugin-obsidian";
const PLUGIN_FILES = Object.freeze(["main.js", "manifest.json", "styles.css"]);
const AUTHENTICATION_ASSET = "release-signature.txt";
const RELEASE_ASSETS = Object.freeze([...PLUGIN_FILES, AUTHENTICATION_ASSET]);
const INSTALL_ORDER = Object.freeze(["main.js", "styles.css", "manifest.json"]);
const BACKUP_DIRECTORY = ".tiago7-plugin-updater-backups";
const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const MAX_AUTHENTICATION_ASSET_BYTES = 4096;
const SIGNATURE_MAGIC = "tiago7-obsidian-plugin-release-signature-v1";
const PINNED_PUBLIC_KEY_SPKI_B64 =
  "MCowBQYDK2VwAyEAnEKaOvQuKdbnfu+U7DubEqfLyUNJI3grxzlfYHUtrpc=";

// Esta é a única fonte de autorização. Dados remotos nunca acrescentam entradas.
const AUTHORIZED_PLUGINS = Object.freeze([
  Object.freeze({
    id: "tiago7-plain-text-export-plugin-obsidian",
    name: "tiago7 Plain Text Export Plugin Obsidian",
    owner: "tiagocoelho7",
    repository: "tiago7-plain-text-export-plugin-obsidian",
    latestReleaseApi:
      "https://api.github.com/repos/tiagocoelho7/tiago7-plain-text-export-plugin-obsidian/releases/latest",
  }),
]);

class UpdaterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "UpdaterError";
    this.code = code;
  }
}

function strictVersion(value) {
  if (typeof value !== "string") return null;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger)) return null;
  return parts;
}

function compareVersions(left, right) {
  const a = strictVersion(left);
  const b = strictVersion(right);
  if (!a || !b) {
    throw new UpdaterError("INVALID_VERSION", "Foi encontrada uma versão inválida.");
  }
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

function versionFromTag(tag) {
  if (typeof tag !== "string") return null;
  const candidate = tag.startsWith("v") ? tag.slice(1) : tag;
  return strictVersion(candidate) ? candidate : null;
}

function decodeJson(buffer, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (_error) {
    throw new UpdaterError("INVALID_JSON", `${label} não está em UTF-8 válido.`);
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new UpdaterError("INVALID_JSON", `${label} não contém JSON válido.`);
  }
}

function cloneArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  throw new UpdaterError("INVALID_DOWNLOAD", "O GitHub retornou um asset em formato inesperado.");
}

function encodeCanonicalBase64(bytes) {
  if (typeof globalThis.btoa !== "function") {
    throw new UpdaterError("CRYPTO_UNAVAILABLE", "Base64 padrão não está disponível neste dispositivo.");
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function strictCanonicalBase64Decode(value, expectedByteLength, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) ||
    typeof globalThis.atob !== "function"
  ) {
    throw new UpdaterError("INVALID_BASE64", `${label} não usa Base64 padrão canônico.`);
  }

  let binary;
  try {
    binary = globalThis.atob(value);
  } catch (_error) {
    throw new UpdaterError("INVALID_BASE64", `${label} não usa Base64 padrão canônico.`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (bytes.byteLength !== expectedByteLength || encodeCanonicalBase64(bytes) !== value) {
    throw new UpdaterError("INVALID_BASE64", `${label} não usa Base64 padrão canônico.`);
  }
  return bytes;
}

function asciiFromBytes(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return value;
}

function parseReleaseSignature(rawBuffer) {
  if (!(rawBuffer instanceof ArrayBuffer)) {
    throw new UpdaterError("AUTHENTICATION_FAILED", "O arquivo de assinatura não contém bytes crus.");
  }
  const bytes = new Uint8Array(rawBuffer);
  const lfPositions = [];

  for (let index = 0; index < bytes.byteLength; index += 1) {
    const byte = bytes[index];
    if (byte === 0x0a) {
      lfPositions.push(index);
      continue;
    }
    if (byte < 0x21 || byte > 0x7e) {
      throw new UpdaterError(
        "AUTHENTICATION_FAILED",
        "release-signature.txt contém byte proibido ou não ASCII."
      );
    }
  }

  if (
    lfPositions.length !== 13 ||
    bytes.byteLength === 0 ||
    lfPositions[12] !== bytes.byteLength - 1
  ) {
    throw new UpdaterError(
      "AUTHENTICATION_FAILED",
      "release-signature.txt precisa ter exatamente 13 linhas terminadas em LF."
    );
  }

  const lines = [];
  let lineStart = 0;
  for (const lfPosition of lfPositions) {
    if (lfPosition === lineStart) {
      throw new UpdaterError("AUTHENTICATION_FAILED", "release-signature.txt contém linha vazia.");
    }
    lines.push(asciiFromBytes(bytes.subarray(lineStart, lfPosition)));
    lineStart = lfPosition + 1;
  }

  const exactValue = (lineIndex, prefix) => {
    const line = lines[lineIndex];
    if (!line.startsWith(prefix) || line.length === prefix.length) {
      throw new UpdaterError(
        "AUTHENTICATION_FAILED",
        `Campo inválido na linha ${lineIndex + 1} de release-signature.txt.`
      );
    }
    return line.slice(prefix.length);
  };

  if (lines[0] !== SIGNATURE_MAGIC || lines[1] !== "scheme=ed25519") {
    throw new UpdaterError("AUTHENTICATION_FAILED", "Magic ou scheme da assinatura é inválido.");
  }

  const keyId = exactValue(2, "key-id=");
  const host = exactValue(3, "host=");
  const owner = exactValue(4, "owner=");
  const repository = exactValue(5, "repository=");
  const pluginId = exactValue(6, "plugin-id=");
  const version = exactValue(7, "version=");
  const tag = exactValue(8, "tag=");
  const mainHash = exactValue(9, "main.js.sha256=");
  const manifestHash = exactValue(10, "manifest.json.sha256=");
  const stylesHash = exactValue(11, "styles.css.sha256=");
  const signatureBase64 = exactValue(12, "signature=");

  if (!/^sha256:[0-9a-f]{64}$/.test(keyId)) {
    throw new UpdaterError("AUTHENTICATION_FAILED", "O key-id assinado é inválido.");
  }
  if (!strictVersion(version)) {
    throw new UpdaterError("AUTHENTICATION_FAILED", "A versão assinada é inválida.");
  }
  for (const [name, hash] of [
    ["main.js", mainHash],
    ["manifest.json", manifestHash],
    ["styles.css", stylesHash],
  ]) {
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      throw new UpdaterError("AUTHENTICATION_FAILED", `O hash assinado de ${name} é inválido.`);
    }
  }
  if (!/^[A-Za-z0-9+/]{86}==$/.test(signatureBase64)) {
    throw new UpdaterError("INVALID_BASE64", "A assinatura Ed25519 não usa Base64 padrão canônico.");
  }

  const signatureBytes = strictCanonicalBase64Decode(
    signatureBase64,
    64,
    "A assinatura Ed25519"
  );
  const signedPrefix = rawBuffer.slice(0, lfPositions[11] + 1);

  return {
    keyId,
    host,
    owner,
    repository,
    pluginId,
    version,
    tag,
    hashes: Object.freeze({
      "main.js": mainHash,
      "manifest.json": manifestHash,
      "styles.css": stylesHash,
    }),
    signatureBytes,
    signedPrefix,
  };
}

function cloneReleaseMetadata(release) {
  const assets = release.assets.map((asset) =>
    Object.freeze({
      name: asset.name,
      id: asset.id,
      state: asset.state,
      size: asset.size,
      digest: asset.digest,
      url: asset.url,
    })
  );
  return Object.freeze({
    draft: release.draft,
    prerelease: release.prerelease,
    immutable: release.immutable,
    tag_name: release.tag_name,
    assets: Object.freeze(assets),
  });
}

function cloneLocalSnapshot(local) {
  return Object.freeze({ installed: local.installed, version: local.version });
}

function sameLocalSnapshot(left, right) {
  return Boolean(
    left &&
    right &&
    left.installed === right.installed &&
    left.version === right.version
  );
}

function assetByteLimit(assetName) {
  return assetName === AUTHENTICATION_ASSET
    ? MAX_AUTHENTICATION_ASSET_BYTES
    : MAX_ASSET_BYTES;
}

async function sha256Hex(buffer) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new UpdaterError(
      "CRYPTO_UNAVAILABLE",
      "A Web Crypto API não está disponível neste dispositivo."
    );
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function derivePinnedAuthority() {
  if (
    !globalThis.crypto ||
    !globalThis.crypto.subtle ||
    typeof globalThis.crypto.subtle.importKey !== "function"
  ) {
    throw new UpdaterError(
      "CRYPTO_UNAVAILABLE",
      "A verificação Ed25519 não está disponível neste dispositivo."
    );
  }

  const spkiBytes = strictCanonicalBase64Decode(
    PINNED_PUBLIC_KEY_SPKI_B64,
    44,
    "A chave pública fixada"
  );
  const spkiBuffer = cloneArrayBuffer(spkiBytes);
  const keyId = `sha256:${await sha256Hex(spkiBuffer)}`;
  let verificationKey;
  try {
    verificationKey = await globalThis.crypto.subtle.importKey(
      "spki",
      spkiBuffer,
      { name: "Ed25519" },
      false,
      ["verify"]
    );
  } catch (_error) {
    throw new UpdaterError(
      "CRYPTO_UNAVAILABLE",
      "Não foi possível importar a chave pública Ed25519 fixada."
    );
  }
  if (
    !verificationKey ||
    verificationKey.type !== "public" ||
    verificationKey.extractable !== false ||
    !verificationKey.algorithm ||
    verificationKey.algorithm.name !== "Ed25519" ||
    !verificationKey.usages ||
    verificationKey.usages.length !== 1 ||
    verificationKey.usages[0] !== "verify"
  ) {
    throw new UpdaterError(
      "CRYPTO_UNAVAILABLE",
      "A chave pública Ed25519 importada não possui as invariantes exigidas."
    );
  }
  return { keyId, verificationKey };
}

async function verifyEd25519Signature(verificationKey, signatureBytes, signedPrefix) {
  if (
    !globalThis.crypto ||
    !globalThis.crypto.subtle ||
    typeof globalThis.crypto.subtle.verify !== "function"
  ) {
    throw new UpdaterError(
      "CRYPTO_UNAVAILABLE",
      "A verificação Ed25519 não está disponível neste dispositivo."
    );
  }
  let verified;
  try {
    verified = await globalThis.crypto.subtle.verify(
      { name: "Ed25519" },
      verificationKey,
      signatureBytes,
      signedPrefix
    );
  } catch (_error) {
    throw new UpdaterError("AUTHENTICATION_FAILED", "A verificação Ed25519 falhou fechada.");
  }
  if (verified !== true) {
    throw new UpdaterError("AUTHENTICATION_FAILED", "A assinatura Ed25519 da release é inválida.");
  }
}

function validateSignatureBindings(
  definition,
  releaseMetadata,
  manifest,
  computedHashes,
  parsedSignature,
  derivedKeyId
) {
  const tagVersion = versionFromTag(releaseMetadata.tag_name);
  if (
    parsedSignature.keyId !== derivedKeyId ||
    parsedSignature.host !== "github.com" ||
    definition.owner !== "tiagocoelho7" ||
    parsedSignature.owner !== "tiagocoelho7" ||
    parsedSignature.repository !== definition.repository ||
    parsedSignature.pluginId !== definition.id ||
    parsedSignature.tag !== releaseMetadata.tag_name ||
    !tagVersion ||
    parsedSignature.version !== tagVersion ||
    parsedSignature.version !== manifest.version
  ) {
    throw new UpdaterError(
      "AUTHENTICATION_FAILED",
      "Os vínculos de autoridade da assinatura não correspondem à release autorizada."
    );
  }

  for (const assetName of PLUGIN_FILES) {
    if (parsedSignature.hashes[assetName] !== computedHashes[assetName]) {
      throw new UpdaterError(
        "AUTHENTICATION_FAILED",
        `O hash assinado de ${assetName} não corresponde aos bytes autenticados.`
      );
    }
  }
}

function timestampForPath(date) {
  return date.toISOString().replace(/[-:.]/g, "");
}

class Tiago7PluginUpdater extends Plugin {
  async onload() {
    this.states = new Map();
    this.definitions = new Map();

    for (const definition of AUTHORIZED_PLUGINS) {
      this.assertSafeDefinition(definition);
      if (this.definitions.has(definition.id)) {
        throw new Error(`ID duplicado na whitelist: ${definition.id}`);
      }
      this.definitions.set(definition.id, definition);
      this.states.set(definition.id, {
        status: "Não verificado",
        detail: "Use o botão para consultar o GitHub.",
        installedVersion: null,
        availableVersion: null,
        installable: null,
        hasBackup: false,
        busy: false,
      });
    }

    this.settingsTab = new UpdaterSettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.addCommand({
      id: "check-my-plugins-for-updates",
      name: "Verificar atualizações dos meus plugins",
      callback: () => this.checkAll(),
    });
    await this.refreshLocalStates();
  }

  assertSafeDefinition(definition) {
    const safePart = /^[a-z0-9][a-z0-9-]*$/;
    if (
      !definition ||
      !safePart.test(definition.id) ||
      !safePart.test(definition.owner) ||
      !safePart.test(definition.repository) ||
      definition.owner !== "tiagocoelho7"
    ) {
      throw new Error("Entrada insegura na whitelist do updater.");
    }
    if (definition.id === UPDATER_ID) {
      throw new Error("O updater não pode autorizar a própria atualização.");
    }
    const expected = `https://api.github.com/repos/${definition.owner}/${definition.repository}/releases/latest`;
    if (definition.latestReleaseApi !== expected) {
      throw new Error(`Endpoint inesperado na whitelist: ${definition.id}`);
    }
  }

  getDefinition(pluginId) {
    const definition = this.definitions.get(pluginId);
    if (!definition || pluginId === UPDATER_ID) {
      throw new UpdaterError("NOT_AUTHORIZED", "Este plugin não está autorizado pelo updater.");
    }
    return definition;
  }

  pluginsRoot() {
    return normalizePath(`${this.app.vault.configDir}/plugins`);
  }

  managedPath(...parts) {
    const root = this.pluginsRoot();
    const result = normalizePath([root, ...parts].join("/"));
    if (result !== root && !result.startsWith(`${root}/`)) {
      throw new UpdaterError("UNSAFE_PATH", "Um caminho fora da pasta de plugins foi bloqueado.");
    }
    return result;
  }

  pluginDirectory(definition) {
    this.getDefinition(definition.id);
    return this.managedPath(definition.id);
  }

  backupRoot(definition) {
    this.getDefinition(definition.id);
    return this.managedPath(BACKUP_DIRECTORY, definition.id);
  }

  async ensureDirectory(path) {
    const root = this.pluginsRoot();
    if (path !== root && !path.startsWith(`${root}/`)) {
      throw new UpdaterError("UNSAFE_PATH", "Criação de pasta fora da área permitida bloqueada.");
    }
    const segments = path.split("/");
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      if (!(await this.app.vault.adapter.exists(current))) {
        await this.app.vault.adapter.mkdir(current);
      }
    }
  }

  async inspectLocal(definition) {
    const directory = this.pluginDirectory(definition);
    const manifestPath = normalizePath(`${directory}/manifest.json`);
    const manifestExists = await this.app.vault.adapter.exists(manifestPath);

    if (!manifestExists) {
      for (const assetName of PLUGIN_FILES) {
        if (await this.app.vault.adapter.exists(normalizePath(`${directory}/${assetName}`))) {
          throw new UpdaterError(
            "PARTIAL_INSTALLATION",
            "Há arquivos do plugin sem um manifest.json válido; corrija a instalação manualmente."
          );
        }
      }
      return { installed: false, version: null };
    }

    let manifest;
    try {
      manifest = JSON.parse(await this.app.vault.adapter.read(manifestPath));
    } catch (_error) {
      throw new UpdaterError("INVALID_LOCAL_MANIFEST", "O manifest.json instalado é inválido.");
    }
    if (manifest.id !== definition.id || !strictVersion(manifest.version)) {
      throw new UpdaterError(
        "INVALID_LOCAL_MANIFEST",
        "O manifest.json instalado tem ID ou versão inválidos."
      );
    }
    return { installed: true, version: manifest.version };
  }

  async refreshLocalStates() {
    for (const definition of AUTHORIZED_PLUGINS) {
      const state = this.states.get(definition.id);
      try {
        const local = await this.inspectLocal(definition);
        state.installedVersion = local.version;
        if (!state.installable && state.status !== "Atualizado") {
          state.status = local.installed ? "Não verificado" : "Não instalado";
          state.detail = local.installed
            ? "Use o botão para consultar o GitHub."
            : "Nenhuma instalação local foi encontrada.";
        }
      } catch (error) {
        state.status = "Erro ao verificar";
        state.detail = this.errorMessage(error);
        state.installable = null;
      }
      state.hasBackup = Boolean(await this.findLatestBackup(definition));
    }
    this.renderSettings();
  }

  async githubRequest(definition, url, accept) {
    const latest = definition.latestReleaseApi;
    const assetPrefix = `https://api.github.com/repos/${definition.owner}/${definition.repository}/releases/assets/`;
    const isAsset = url.startsWith(assetPrefix) && /^\d+$/.test(url.slice(assetPrefix.length));
    if (url !== latest && !isAsset) {
      throw new UpdaterError("UNAUTHORIZED_ENDPOINT", "Uma requisição fora da whitelist foi bloqueada.");
    }
    return requestUrl({
      url,
      method: "GET",
      headers: {
        Accept: accept,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    });
  }

  validateRelease(definition, release) {
    this.assertSafeDefinition(definition);
    if (!release || typeof release !== "object") {
      throw new UpdaterError("INVALID_RELEASE", "A resposta da release é inválida.");
    }
    if (release.draft !== false) {
      throw new UpdaterError("INVALID_RELEASE", "A release não confirmou draft como false.");
    }
    if (release.prerelease !== false) {
      throw new UpdaterError("INVALID_RELEASE", "A release não confirmou prerelease como false.");
    }
    if (release.immutable !== true) {
      throw new UpdaterError(
        "RELEASE_NOT_IMMUTABLE",
        "A release não possui Release Immutability confirmada pela API."
      );
    }

    const tagVersion = versionFromTag(release.tag_name);
    if (!tagVersion) {
      throw new UpdaterError("INVALID_VERSION", "A tag da release não contém uma versão válida.");
    }
    if (!Array.isArray(release.assets) || release.assets.length !== RELEASE_ASSETS.length) {
      throw new UpdaterError(
        "INVALID_ASSETS",
        "A release precisa conter exatamente os três arquivos do plugin e release-signature.txt."
      );
    }

    const assetsByName = new Map();
    for (const asset of release.assets) {
      if (!asset || !RELEASE_ASSETS.includes(asset.name) || assetsByName.has(asset.name)) {
        throw new UpdaterError("INVALID_ASSETS", "A lista de assets da release não é a esperada.");
      }
      if (!Number.isSafeInteger(asset.id) || asset.id <= 0) {
        throw new UpdaterError("INVALID_ASSETS", `O asset ${asset.name} não possui ID válido.`);
      }
      if (asset.state !== "uploaded") {
        throw new UpdaterError("INVALID_ASSETS", `O asset ${asset.name} não está pronto para download.`);
      }
      if (
        !Number.isSafeInteger(asset.size) ||
        asset.size <= 0 ||
        asset.size > assetByteLimit(asset.name)
      ) {
        throw new UpdaterError(
          "INVALID_ASSETS",
          `O tamanho declarado de ${asset.name} é inválido ou excede o limite permitido.`
        );
      }
      if (typeof asset.digest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(asset.digest)) {
        throw new UpdaterError(
          "INVALID_DIGEST",
          `O asset ${asset.name} não possui digest SHA-256 válido.`
        );
      }
      const expectedUrl = `https://api.github.com/repos/${definition.owner}/${definition.repository}/releases/assets/${asset.id}`;
      if (asset.url !== expectedUrl) {
        throw new UpdaterError("INVALID_ASSETS", `O endpoint do asset ${asset.name} é inesperado.`);
      }
      assetsByName.set(asset.name, asset);
    }
    return { tagVersion, assetsByName };
  }

  async authenticateCachedPayload(definition, payload) {
    if (
      !payload ||
      typeof payload !== "object" ||
      !payload.releaseMetadata ||
      !payload.rawAssets ||
      !payload.localSnapshot ||
      typeof payload.localSnapshot.installed !== "boolean" ||
      (payload.localSnapshot.installed
        ? !strictVersion(payload.localSnapshot.version)
        : payload.localSnapshot.version !== null)
    ) {
      throw new UpdaterError("AUTHENTICATION_FAILED", "O cache autenticável da release é inválido.");
    }

    const cachedAssetNames = Object.keys(payload.rawAssets);
    if (
      cachedAssetNames.length !== RELEASE_ASSETS.length ||
      cachedAssetNames.some((name) => !RELEASE_ASSETS.includes(name))
    ) {
      throw new UpdaterError(
        "AUTHENTICATION_FAILED",
        "O cache precisa conter exatamente os quatro assets autorizados."
      );
    }

    this.validateRelease(definition, payload.releaseMetadata);
    const releaseMetadata = cloneReleaseMetadata(payload.releaseMetadata);
    const localSnapshot = cloneLocalSnapshot(payload.localSnapshot);
    const rawAssets = {};
    for (const assetName of RELEASE_ASSETS) {
      const cachedBuffer = payload.rawAssets[assetName];
      if (!(cachedBuffer instanceof ArrayBuffer)) {
        throw new UpdaterError("AUTHENTICATION_FAILED", `O cache não contém bytes crus de ${assetName}.`);
      }
      rawAssets[assetName] = cachedBuffer.slice(0);
    }

    const { tagVersion, assetsByName } = this.validateRelease(
      definition,
      releaseMetadata
    );
    const computedHashes = Object.create(null);

    for (const assetName of RELEASE_ASSETS) {
      const asset = assetsByName.get(assetName);
      const buffer = rawAssets[assetName];
      if (buffer.byteLength !== asset.size) {
        throw new UpdaterError(
          "AUTHENTICATION_FAILED",
          `O tamanho cacheado de ${assetName} difere da metadata autenticável.`
        );
      }
      const actual = await sha256Hex(buffer);
      if (`sha256:${actual}` !== asset.digest) {
        throw new UpdaterError(
          "INTEGRITY_FAILED",
          `O SHA-256 de ${assetName} diverge do digest publicado pelo GitHub.`
        );
      }
      computedHashes[assetName] = actual;
    }

    const manifest = decodeJson(rawAssets["manifest.json"], "O manifest.json remoto");
    if (!manifest || manifest.id !== definition.id) {
      throw new UpdaterError("INVALID_MANIFEST", "O ID do manifest remoto não é o autorizado.");
    }
    const manifestVersionIsValid = Boolean(strictVersion(manifest.version));
    if (!manifestVersionIsValid || manifest.version !== tagVersion) {
      const declaredVersion = manifestVersionIsValid ? manifest.version : "uma versão inválida";
      throw new UpdaterError(
        "INVALID_MANIFEST",
        `O manifest remoto declara ${declaredVersion}, mas a tag da release declara ${tagVersion}.`
      );
    }
    if (manifest.isDesktopOnly !== false) {
      throw new UpdaterError(
        "INVALID_MANIFEST",
        "O manifest remoto precisa declarar isDesktopOnly como false."
      );
    }

    const parsedSignature = parseReleaseSignature(rawAssets[AUTHENTICATION_ASSET]);
    const { keyId, verificationKey } = await derivePinnedAuthority();
    validateSignatureBindings(
      definition,
      releaseMetadata,
      manifest,
      computedHashes,
      parsedSignature,
      keyId
    );
    await verifyEd25519Signature(
      verificationKey,
      parsedSignature.signatureBytes,
      parsedSignature.signedPrefix
    );

    const pluginFiles = {};
    for (const assetName of PLUGIN_FILES) {
      pluginFiles[assetName] = rawAssets[assetName].slice(0);
    }
    return {
      version: manifest.version,
      pluginFiles: Object.freeze(pluginFiles),
      localSnapshot,
    };
  }

  async downloadAndValidate(definition, release, localSnapshot) {
    const { assetsByName } = this.validateRelease(definition, release);
    const rawAssets = {};

    for (const assetName of RELEASE_ASSETS) {
      const asset = assetsByName.get(assetName);
      const url = `https://api.github.com/repos/${definition.owner}/${definition.repository}/releases/assets/${asset.id}`;
      const response = await this.githubRequest(definition, url, "application/octet-stream");
      if (response.status !== 200) {
        throw new UpdaterError("DOWNLOAD_FAILED", `Falha ao baixar ${assetName} do GitHub.`);
      }
      const buffer = cloneArrayBuffer(response.arrayBuffer);
      if (buffer.byteLength !== asset.size) {
        throw new UpdaterError(
          "INVALID_DOWNLOAD",
          `O tamanho baixado de ${assetName} difere do tamanho declarado pelo GitHub.`
        );
      }
      rawAssets[assetName] = buffer;
    }

    const payload = Object.freeze({
      releaseMetadata: cloneReleaseMetadata(release),
      rawAssets: Object.freeze(rawAssets),
      localSnapshot: cloneLocalSnapshot(localSnapshot),
    });
    const authenticated = await this.authenticateCachedPayload(definition, payload);
    return { payload, version: authenticated.version };
  }

  async fetchValidatedRelease(definition, localSnapshot) {
    const response = await this.githubRequest(
      definition,
      definition.latestReleaseApi,
      "application/vnd.github+json"
    );
    if (response.status !== 200) {
      throw new UpdaterError("RELEASE_FAILED", "Não foi possível consultar a release no GitHub.");
    }
    return this.downloadAndValidate(definition, response.json, localSnapshot);
  }

  async checkOne(pluginId, quiet = false) {
    const definition = this.getDefinition(pluginId);
    const state = this.states.get(pluginId);
    if (state.busy) return;

    state.busy = true;
    state.status = "Verificando...";
    state.detail = "Consultando e validando a release em memória.";
    state.availableVersion = null;
    state.installable = null;
    this.renderSettings();

    try {
      const local = await this.inspectLocal(definition);
      state.installedVersion = local.version;
      const localSnapshot = cloneLocalSnapshot(local);
      const validated = await this.fetchValidatedRelease(definition, localSnapshot);
      state.availableVersion = validated.version;

      if (local.installed && compareVersions(validated.version, local.version) <= 0) {
        state.status = "Atualizado";
        state.detail = "A versão instalada já é igual ou superior à release válida mais recente.";
      } else {
        state.installable = validated.payload;
        state.status = local.installed ? "Atualização disponível" : "Não instalado";
        state.detail = local.installed
          ? "A release foi baixada e validada. Clique em Atualizar para instalá-la."
          : "A release foi baixada e validada. Clique em Instalar para continuar.";
      }
      if (!quiet) new Notice(`${definition.name}: ${state.status}.`);
    } catch (error) {
      state.status = error && error.code === "RELEASE_NOT_IMMUTABLE"
        ? "Release não imutável"
        : error && ["INTEGRITY_FAILED", "AUTHENTICATION_FAILED", "INVALID_BASE64"].includes(error.code)
          ? "Verificação de integridade falhou"
          : "Erro ao verificar";
      state.detail = this.errorMessage(error);
      if (!quiet) new Notice(`${definition.name}: ${state.detail}`);
    } finally {
      state.busy = false;
      state.hasBackup = Boolean(await this.findLatestBackup(definition));
      this.renderSettings();
    }
  }

  async checkAll() {
    for (const definition of AUTHORIZED_PLUGINS) {
      await this.checkOne(definition.id, true);
    }
    new Notice("Verificação dos plugins autorizados concluída.");
  }

  async createBackup(definition, version) {
    const pluginDirectory = this.pluginDirectory(definition);
    const snapshots = new Map();
    const present = {};

    for (const assetName of PLUGIN_FILES) {
      const path = normalizePath(`${pluginDirectory}/${assetName}`);
      present[assetName] = await this.app.vault.adapter.exists(path);
      if (present[assetName]) {
        snapshots.set(assetName, await this.app.vault.adapter.readBinary(path));
      }
    }

    const createdAt = new Date();
    const folder = normalizePath(
      `${this.backupRoot(definition)}/${timestampForPath(createdAt)}__v${version}`
    );
    await this.ensureDirectory(folder);
    for (const [assetName, buffer] of snapshots) {
      await this.app.vault.adapter.writeBinary(normalizePath(`${folder}/${assetName}`), buffer);
    }
    const metadata = {
      schemaVersion: 1,
      pluginId: definition.id,
      version,
      createdAt: createdAt.toISOString(),
      files: present,
    };
    await this.app.vault.adapter.write(
      normalizePath(`${folder}/backup-info.json`),
      JSON.stringify(metadata, null, 2)
    );
    return { folder, metadata };
  }

  async readBackup(definition, folder) {
    const root = this.backupRoot(definition);
    if (!folder.startsWith(`${root}/`)) return null;
    try {
      const metadata = JSON.parse(
        await this.app.vault.adapter.read(normalizePath(`${folder}/backup-info.json`))
      );
      if (
        !metadata ||
        metadata.schemaVersion !== 1 ||
        metadata.pluginId !== definition.id ||
        !strictVersion(metadata.version) ||
        !metadata.files ||
        PLUGIN_FILES.some((name) => typeof metadata.files[name] !== "boolean")
      ) {
        return null;
      }
      return { folder, metadata };
    } catch (_error) {
      return null;
    }
  }

  async findLatestBackup(definition) {
    const root = this.backupRoot(definition);
    if (!(await this.app.vault.adapter.exists(root))) return null;
    let listing;
    try {
      listing = await this.app.vault.adapter.list(root);
    } catch (_error) {
      return null;
    }
    const folders = Array.isArray(listing.folders) ? listing.folders.slice().sort().reverse() : [];
    for (const folder of folders) {
      const backup = await this.readBackup(definition, folder);
      if (backup) return backup;
    }
    return null;
  }

  async restoreBackupFiles(definition, backup) {
    const restored = new Map();
    for (const assetName of PLUGIN_FILES) {
      if (backup.metadata.files[assetName]) {
        const path = normalizePath(`${backup.folder}/${assetName}`);
        if (!(await this.app.vault.adapter.exists(path))) {
          throw new UpdaterError("INVALID_BACKUP", `O backup não contém ${assetName}.`);
        }
        restored.set(assetName, await this.app.vault.adapter.readBinary(path));
      }
    }

    const pluginDirectory = this.pluginDirectory(definition);
    await this.ensureDirectory(pluginDirectory);
    for (const assetName of INSTALL_ORDER) {
      const target = normalizePath(`${pluginDirectory}/${assetName}`);
      if (backup.metadata.files[assetName]) {
        await this.app.vault.adapter.writeBinary(target, restored.get(assetName));
      } else if (await this.app.vault.adapter.exists(target)) {
        await this.app.vault.adapter.remove(target);
      }
    }
  }

  async install(pluginId) {
    const definition = this.getDefinition(pluginId);
    const state = this.states.get(pluginId);
    if (state.busy || !state.installable) return;

    const payload = state.installable;
    state.installable = null;
    state.busy = true;
    state.detail = "Preparando a instalação validada.";
    this.renderSettings();
    let backup = null;
    const attemptedWrites = [];

    try {
      const authenticated = await this.authenticateCachedPayload(definition, payload);
      const local = await this.inspectLocal(definition);
      if (!sameLocalSnapshot(local, authenticated.localSnapshot)) {
        throw new UpdaterError(
          "LOCAL_CHANGED",
          "A instalação local mudou desde a verificação. Verifique novamente."
        );
      }
      if (local.installed && compareVersions(authenticated.version, local.version) <= 0) {
        throw new UpdaterError("NOT_NEWER", "A versão remota não é superior à instalada.");
      }
      if (local.installed) {
        backup = await this.createBackup(definition, local.version);
      }

      const directory = this.pluginDirectory(definition);
      await this.ensureDirectory(directory);
      for (const assetName of INSTALL_ORDER) {
        const target = normalizePath(`${directory}/${assetName}`);
        attemptedWrites.push(target);
        await this.app.vault.adapter.writeBinary(target, authenticated.pluginFiles[assetName]);
      }

      state.installedVersion = authenticated.version;
      state.availableVersion = authenticated.version;
      state.status = "Atualizado";
      state.detail = "Instalação concluída. Reinicie o Obsidian para carregar a nova versão.";
      state.hasBackup = Boolean(backup || (await this.findLatestBackup(definition)));
      new Notice("Plugin atualizado. Reinicie o Obsidian para carregar a nova versão.");
    } catch (error) {
      let recoveryMessage = "";
      try {
        if (backup) {
          await this.restoreBackupFiles(definition, backup);
          recoveryMessage = " A versão anterior foi restaurada automaticamente.";
        } else {
          for (const target of attemptedWrites.reverse()) {
            if (await this.app.vault.adapter.exists(target)) {
              await this.app.vault.adapter.remove(target);
            }
          }
          recoveryMessage = attemptedWrites.length
            ? " Os arquivos criados nesta tentativa foram removidos."
            : "";
        }
      } catch (recoveryError) {
        recoveryMessage = ` A recuperação automática também falhou: ${this.errorMessage(recoveryError)}`;
      }
      state.status = error && ["INTEGRITY_FAILED", "AUTHENTICATION_FAILED", "INVALID_BASE64"].includes(error.code)
        ? "Verificação de integridade falhou"
        : "Erro ao verificar";
      state.detail = `${this.errorMessage(error)}${recoveryMessage}`;
      new Notice(`Atualização cancelada. ${state.detail}`);
    } finally {
      state.busy = false;
      this.renderSettings();
    }
  }

  async restoreLatest(pluginId) {
    const definition = this.getDefinition(pluginId);
    const state = this.states.get(pluginId);
    if (state.busy) return;

    state.busy = true;
    state.detail = "Restaurando o último backup.";
    this.renderSettings();
    try {
      const backup = await this.findLatestBackup(definition);
      if (!backup) {
        throw new UpdaterError("NO_BACKUP", "Nenhum backup válido foi encontrado.");
      }
      await this.restoreBackupFiles(definition, backup);
      state.installedVersion = backup.metadata.version;
      state.availableVersion = null;
      state.installable = null;
      state.status = "Não verificado";
      state.detail = "Versão anterior restaurada. Reinicie o Obsidian para carregá-la.";
      state.hasBackup = true;
      new Notice("Versão anterior restaurada. Reinicie o Obsidian para carregá-la.");
    } catch (error) {
      state.status = "Erro ao verificar";
      state.detail = this.errorMessage(error);
      new Notice(`Não foi possível restaurar o backup: ${state.detail}`);
    } finally {
      state.busy = false;
      this.renderSettings();
    }
  }

  errorMessage(error) {
    if (error instanceof Error && error.message) return error.message;
    return "Ocorreu um erro inesperado.";
  }

  renderSettings() {
    if (this.settingsTab && this.settingsTab.containerEl) this.settingsTab.display();
  }
}

class UpdaterSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.updater = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Atualizador dos meus plugins" });
    containerEl.createEl("p", {
      text: "Nada é verificado ou instalado automaticamente. Cada ação exige um clique explícito.",
    });

    new Setting(containerEl)
      .setName("Plugins autorizados")
      .setDesc("Consulta apenas a whitelist fixa incluída no código.")
      .addButton((button) =>
        button
          .setButtonText("Verificar todos")
          .setDisabled(Array.from(this.updater.states.values()).some((state) => state.busy))
          .onClick(() => this.updater.checkAll())
      );

    for (const definition of AUTHORIZED_PLUGINS) {
      const state = this.updater.states.get(definition.id);
      const entry = containerEl.createDiv({ cls: "tiago7-updater-plugin-entry" });
      entry.createEl("h3", { text: definition.name });
      entry.createEl("div", {
        text: `Versão instalada: ${state.installedVersion || "não instalada"}`,
      });
      entry.createEl("div", {
        text: `Versão disponível: ${state.availableVersion || "não verificada"}`,
      });
      entry.createEl("div", {
        cls: "tiago7-updater-status",
        text: `Estado: ${state.status}. ${state.detail}`,
      });

      const actions = entry.createDiv({ cls: "tiago7-updater-actions" });
      new Setting(actions).addButton((button) =>
        button
          .setButtonText("Verificar atualização")
          .setDisabled(state.busy)
          .onClick(() => this.updater.checkOne(definition.id))
      );

      if (state.installable) {
        new Setting(actions).addButton((button) =>
          button
            .setButtonText(state.installedVersion ? "Atualizar" : "Instalar")
            .setCta()
            .setDisabled(state.busy)
            .onClick(() => this.updater.install(definition.id))
        );
      }

      if (state.hasBackup) {
        new Setting(actions).addButton((button) =>
          button
            .setButtonText("Restaurar versão anterior")
            .setWarning()
            .setDisabled(state.busy)
            .onClick(() => this.updater.restoreLatest(definition.id))
        );
      }
    }
  }
}

module.exports = Tiago7PluginUpdater;
