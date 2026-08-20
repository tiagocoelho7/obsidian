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
const REQUIRED_ASSETS = Object.freeze(["main.js", "manifest.json", "styles.css"]);
const INSTALL_ORDER = Object.freeze(["main.js", "styles.css", "manifest.json"]);
const BACKUP_DIRECTORY = ".tiago7-plugin-updater-backups";
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

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
      !safePart.test(definition.repository)
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
      for (const assetName of REQUIRED_ASSETS) {
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
    if (!Array.isArray(release.assets) || release.assets.length !== REQUIRED_ASSETS.length) {
      throw new UpdaterError(
        "INVALID_ASSETS",
        "A release precisa conter exatamente main.js, manifest.json e styles.css."
      );
    }

    const assetsByName = new Map();
    for (const asset of release.assets) {
      if (!asset || !REQUIRED_ASSETS.includes(asset.name) || assetsByName.has(asset.name)) {
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
        asset.size > MAX_ASSET_BYTES
      ) {
        throw new UpdaterError(
          "INVALID_ASSETS",
          `O tamanho declarado de ${asset.name} é inválido ou excede 5 MiB.`
        );
      }
      if (typeof asset.digest !== "string" || !/^sha256:[0-9a-fA-F]{64}$/.test(asset.digest)) {
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

  async downloadAndValidate(definition, release) {
    const { tagVersion, assetsByName } = this.validateRelease(definition, release);
    const files = new Map();
    const expectedDigests = new Map();

    for (const assetName of REQUIRED_ASSETS) {
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
      const expected = asset.digest.slice("sha256:".length).toLowerCase();
      const actual = await sha256Hex(buffer);
      if (actual !== expected) {
        throw new UpdaterError(
          "INTEGRITY_FAILED",
          `O SHA-256 de ${assetName} diverge do digest publicado pelo GitHub.`
        );
      }
      files.set(assetName, buffer);
      expectedDigests.set(assetName, expected);
    }

    const manifest = decodeJson(files.get("manifest.json"), "O manifest.json remoto");
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

    return { version: manifest.version, files, expectedDigests };
  }

  async fetchValidatedRelease(definition) {
    const response = await this.githubRequest(
      definition,
      definition.latestReleaseApi,
      "application/vnd.github+json"
    );
    if (response.status !== 200) {
      throw new UpdaterError("RELEASE_FAILED", "Não foi possível consultar a release no GitHub.");
    }
    return this.downloadAndValidate(definition, response.json);
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
      const validated = await this.fetchValidatedRelease(definition);
      state.availableVersion = validated.version;

      if (local.installed && compareVersions(validated.version, local.version) <= 0) {
        state.status = "Atualizado";
        state.detail = "A versão instalada já é igual ou superior à release válida mais recente.";
      } else {
        state.installable = validated;
        state.status = local.installed ? "Atualização disponível" : "Não instalado";
        state.detail = local.installed
          ? "A release foi baixada e validada. Clique em Atualizar para instalá-la."
          : "A release foi baixada e validada. Clique em Instalar para continuar.";
      }
      if (!quiet) new Notice(`${definition.name}: ${state.status}.`);
    } catch (error) {
      state.status = error && error.code === "RELEASE_NOT_IMMUTABLE"
        ? "Release não imutável"
        : error && error.code === "INTEGRITY_FAILED"
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

  async verifyCachedPayload(payload) {
    for (const assetName of REQUIRED_ASSETS) {
      const buffer = payload.files.get(assetName);
      const expected = payload.expectedDigests.get(assetName);
      if (!(buffer instanceof ArrayBuffer) || (await sha256Hex(buffer)) !== expected) {
        throw new UpdaterError(
          "INTEGRITY_FAILED",
          `Os dados validados de ${assetName} não estão mais íntegros.`
        );
      }
    }
  }

  async createBackup(definition, version) {
    const pluginDirectory = this.pluginDirectory(definition);
    const snapshots = new Map();
    const present = {};

    for (const assetName of REQUIRED_ASSETS) {
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
        REQUIRED_ASSETS.some((name) => typeof metadata.files[name] !== "boolean")
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
    for (const assetName of REQUIRED_ASSETS) {
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

    state.busy = true;
    state.detail = "Preparando a instalação validada.";
    this.renderSettings();
    let backup = null;
    const attemptedWrites = [];

    try {
      const payload = state.installable;
      await this.verifyCachedPayload(payload);
      const local = await this.inspectLocal(definition);
      if (local.version !== state.installedVersion) {
        throw new UpdaterError(
          "LOCAL_CHANGED",
          "A instalação local mudou desde a verificação. Verifique novamente."
        );
      }
      if (local.installed && compareVersions(payload.version, local.version) <= 0) {
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
        await this.app.vault.adapter.writeBinary(target, payload.files.get(assetName));
      }

      state.installedVersion = payload.version;
      state.availableVersion = payload.version;
      state.installable = null;
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
      state.status = error && error.code === "INTEGRITY_FAILED"
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
