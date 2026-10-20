import {
  SOLID_TERRAIN_TYPES,
  getMechanismKind,
  getPathValue,
  getSelectedObject,
  selectionKey
} from "../model/LevelModel.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function assetUrl(relativePath, revision = "") {
  const path = String(relativePath ?? "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const version = revision
    ? `?v=${encodeURIComponent(revision)}`
    : "";
  return `/assets/${path}${version}`;
}

function option(value, label, selectedValue) {
  return `<option value="${escapeHtml(value)}" ${
    String(value) === String(selectedValue ?? "") ? "selected" : ""
  }>${escapeHtml(label)}</option>`;
}

function field({
  label,
  path,
  value,
  type = "text",
  note = "",
  wide = false,
  options = null,
  nullable = false,
  min,
  max,
  step
}) {
  const common = [
    `data-path="${escapeHtml(path)}"`,
    `data-value-type="${type === "number" ? "number" : "string"}"`,
    nullable ? 'data-nullable="true"' : "",
    min !== undefined ? `min="${min}"` : "",
    max !== undefined ? `max="${max}"` : "",
    step !== undefined ? `step="${step}"` : ""
  ]
    .filter(Boolean)
    .join(" ");

  let control;
  if (options) {
    control = `<select ${common}>${options}</select>`;
  } else if (type === "textarea") {
    control = `<textarea ${common}>${escapeHtml(value)}</textarea>`;
  } else if (type === "color") {
    const hex = /^#[0-9a-f]{6}$/i.test(value ?? "")
      ? value
      : "#64748b";
    control = `
      <div class="color-field">
        <input type="color" data-path="${escapeHtml(path)}" data-value-type="string" value="${escapeHtml(hex)}" aria-label="${escapeHtml(label)}颜色" />
        <input type="text" ${common} value="${escapeHtml(value)}" spellcheck="false" />
      </div>
    `;
  } else {
    control = `<input type="${type}" ${common} value="${escapeHtml(value)}" spellcheck="false" />`;
  }

  return `
    <div class="field ${wide ? "is-wide" : ""}">
      <label>
        <span>${escapeHtml(label)}</span>
        ${note ? `<span class="field-note">${escapeHtml(note)}</span>` : ""}
      </label>
      ${control}
    </div>
  `;
}

function section(title, content, aside = "") {
  return `
    <section class="form-section">
      <h3 class="form-section-title">
        <span>${escapeHtml(title)}</span>
        ${aside ? `<span class="section-hint">${escapeHtml(aside)}</span>` : ""}
      </h3>
      <div class="field-grid">${content}</div>
    </section>
  `;
}

export class Inspector {
  constructor(container) {
    this.container = container;
    this.lastSignature = "";
    this.currentDocumentEpoch = -1;
    this.targetLevelFilters = new Map();
  }

  setContext({ catalogs, knownLevels }) {
    this.catalogs = catalogs;
    this.knownLevels = knownLevels;
    this.lastSignature = "";
  }

  updateKnownLevels(knownLevels) {
    this.knownLevels = knownLevels;
  }

  setTargetLevelFilter(levelId, entranceId) {
    this.targetLevelFilters.set(entranceId, levelId);
  }

  render(store, { force = false } = {}) {
    const selection = store.selection;
    const referenceSignature = (this.knownLevels ?? []).map(
      (knownLevel) => {
        const mechanisms = knownLevel.mechanisms ?? [];
        return {
          id: knownLevel.id,
          entrances: mechanisms
            .filter((mechanism) => mechanism.type === "entrance")
            .map((entrance) => entrance.id),
          exits: mechanisms
            .filter((mechanism) => mechanism.type === "exit")
            .map((exit) => exit.id)
        };
      }
    );
    const signature = [
      store.epoch,
      selectionKey(selection),
      JSON.stringify(referenceSignature)
    ].join("|");
    const shouldRebuild =
      force ||
      signature !== this.lastSignature ||
      store.epoch !== this.currentDocumentEpoch;

    if (shouldRebuild) {
      this.currentDocumentEpoch = store.epoch;
      this.lastSignature = signature;
      this.container.innerHTML = this.buildHtml(store);
    } else {
      this.refreshValues(store);
    }
  }

  buildHtml(store) {
    const selection = store.selection;
    if (!selection || selection.section === "level") {
      return this.buildLevelFields(store.document);
    }

    const object = getSelectedObject(store.document, selection);
    if (!object) {
      return '<p class="empty-inspector">选中对象已不存在。</p>';
    }

    if (selection.section === "spawnPoint") {
      return this.buildSpawnFields(object);
    }

    if (selection.section === "solids") {
      return this.buildSolidFields(object);
    }
    if (selection.section === "actors") {
      return this.buildActorFields(store.document, object);
    }
    if (selection.section === "items") {
      return this.buildItemFields(object);
    }
    if (selection.section === "mechanisms") {
      const kind = getMechanismKind(object.type);
      return this[kind.inspectorMethod](
        store.document,
        object
      );
    }

    return '<p class="empty-inspector">该对象暂时没有可编辑属性。</p>';
  }

  buildLevelFields(level) {
    const camera = level.camera ?? {};
    const backgroundAsset = level.world.backgroundAsset;
    const basic = [
      field({
        label: "关卡 ID",
        path: "id",
        value: level.id,
        note: "小写与中划线"
      }),
      field({ label: "关卡名称", path: "name", value: level.name }),
      field({
        label: "世界宽度",
        path: "world.width",
        value: level.world.width,
        type: "number",
        min: 320,
        step: 1
      }),
      field({
        label: "世界高度",
        path: "world.height",
        value: level.world.height,
        type: "number",
        min: 240,
        step: 1
      }),
      field({
        label: "背景颜色",
        path: "world.backgroundColor",
        value: level.world.backgroundColor,
        type: "color",
        wide: true
      })
    ].join("");

    const cameraFields = [
      field({
        label: "水平跟随",
        path: "camera.lerpX",
        value: camera.lerpX,
        type: "number",
        min: 0,
        max: 1,
        step: 0.01
      }),
      field({
        label: "垂直跟随",
        path: "camera.lerpY",
        value: camera.lerpY,
        type: "number",
        min: 0,
        max: 1,
        step: 0.01
      }),
      field({
        label: "死区宽度",
        path: "camera.deadzoneWidth",
        value: camera.deadzoneWidth,
        type: "number",
        min: 0,
        step: 1
      }),
      field({
        label: "死区高度",
        path: "camera.deadzoneHeight",
        value: camera.deadzoneHeight,
        type: "number",
        min: 0,
        step: 1
      })
    ].join("");

    const backgroundFields = `
      <div class="field is-wide background-asset-field">
        <label>
          <span>背景素材</span>
          <span class="field-note">导入后会替换背景图</span>
        </label>
        ${
          backgroundAsset
            ? `
              <div class="background-asset-current">
                <span class="background-asset-preview">
                  <img
                    src="${escapeHtml(
                      assetUrl(
                        backgroundAsset.id,
                        backgroundAsset.revision
                      )
                    )}"
                    alt="${escapeHtml(
                      backgroundAsset.fileName ?? "关卡背景"
                    )}"
                  />
                </span>
                <span class="background-asset-copy">
                  <strong>${escapeHtml(
                    backgroundAsset.fileName ??
                      backgroundAsset.id
                  )}</strong>
                  <small>${escapeHtml(backgroundAsset.path)}</small>
                </span>
              </div>
            `
            : `
              <div class="background-asset-empty">
                尚未导入背景图，当前使用背景颜色。
              </div>
            `
        }
        <div class="background-asset-actions">
          <button
            class="button button-quiet"
            type="button"
            data-action="import-background"
          >
            从素材库导入背景
          </button>
          ${
            backgroundAsset
              ? `
                <button
                  class="text-button"
                  type="button"
                  data-action="clear-background"
                >
                  移除背景
                </button>
              `
              : ""
          }
        </div>
      </div>
    `;

    return [
      section("关卡基础", basic),
      section("关卡背景", backgroundFields),
      section("镜头参数", cameraFields),
      section(
        "初始出生点",
        [
          field({
            label: "初始出生点",
            path: "initialSpawnId",
            value: level.initialSpawnId,
            options: level.spawnPoints
              .map((spawn) =>
                option(
                  spawn.id,
                  `${spawn.name} · ${spawn.id}`,
                  level.initialSpawnId
                )
              )
              .join(""),
            wide: true
          })
        ].join("")
      ),
      ...level.spawnPoints.map((spawn, index) =>
        section(
          `出生点 ${index + 1}`,
          [
            field({
              label: "出生点 ID",
              path: `spawnPoints.${index}.id`,
              value: spawn.id,
              note: "稳定引用名"
            }),
            field({
              label: "显示名称",
              path: `spawnPoints.${index}.name`,
              value: spawn.name
            }),
            field({
              label: "X",
              path: `spawnPoints.${index}.x`,
              value: spawn.x,
              type: "number",
              step: 1
            }),
            field({
              label: "Y",
              path: `spawnPoints.${index}.y`,
              value: spawn.y,
              type: "number",
              step: 1
            })
          ].join(""),
          index === 0 ? "条件传送目标" : ""
        )
      )
    ].join("");
  }

  buildSpawnFields(spawn) {
    return [
      section("出生点标识", [
        field({ label: "出生点 ID", path: "id", value: spawn.id }),
        field({ label: "显示名称", path: "name", value: spawn.name })
      ].join("")),
      section(
        "坐标",
        [
          field({
            label: "X",
            path: "x",
            value: spawn.x,
            type: "number",
            step: 1
          }),
          field({
            label: "Y",
            path: "y",
            value: spawn.y,
            type: "number",
            step: 1
          })
        ].join(""),
        "世界坐标"
      )
    ].join("");
  }

  buildSolidFields(solid) {
    return [
      section("基础信息", [
        field({ label: "对象 ID", path: "id", value: solid.id }),
        field({
          label: "地形类型",
          path: "terrainType",
          value: solid.terrainType ?? "ground",
          options: SOLID_TERRAIN_TYPES.map((terrain) =>
            option(
              terrain.key,
              `${terrain.label} · ${terrain.description}`,
              solid.terrainType ?? "ground"
            )
          ).join(""),
          wide: true
        }),
        field({
          label: "颜色",
          path: "color",
          value: solid.color,
          type: "color"
        })
      ].join("")),
      section("位置与尺寸", this.positionFields(solid), "中心点坐标")
    ].join("");
  }

  buildActorFields(level, actor) {
    const actorOptions = [
      '<option value="">请选择角色</option>',
      ...Object.values(this.catalogs.actors ?? {})
        .filter((actorDefinition) => actorDefinition.type !== "player")
        .map((actorDefinition) =>
          option(
            actorDefinition.id,
            `${actorDefinition.name} · ${
              actorDefinition.type === "npc" ? "NPC" : "敌人"
            }`,
            actor.actorId
          )
        )
    ].join("");

    return [
      section("角色实例", [
        field({
          label: "实例 ID",
          path: "instanceId",
          value: actor.instanceId,
          note: "关卡内唯一"
        }),
        field({
          label: "角色定义",
          path: "actorId",
          value: actor.actorId,
          options: actorOptions
        })
      ].join("")),
      section(
        "位置与缩放",
        [
          field({
            label: "X",
            path: "x",
            value: actor.x,
            type: "number",
            step: 1
          }),
          field({
            label: "Y",
            path: "y",
            value: actor.y,
            type: "number",
            step: 1
          }),
          field({
            label: "水平缩放",
            path: "scaleX",
            value: actor.scaleX ?? 1,
            type: "number",
            min: 0.05,
            step: 0.01
          }),
          field({
            label: "垂直缩放",
            path: "scaleY",
            value: actor.scaleY ?? 1,
            type: "number",
            min: 0.05,
            step: 0.01
          })
        ].join(""),
        "四角等比，四边单轴"
      ),
      this.buildActorReference(actor.actorId)
    ].join("");
  }

  buildActorReference(actorId) {
    const definition = this.catalogs.actors?.[actorId];
    if (!definition) {
      return `
        <div class="reference-card">
          <strong>角色定义缺失</strong>
          <p>请检查 platform_dome/data/configs/actors.json。</p>
        </div>
      `;
    }
    const stats = definition.stats ?? {};
    return `
      <div class="reference-card">
        <strong>${escapeHtml(definition.name)} · ${escapeHtml(
          definition.type === "npc" ? "NPC" : definition.type
        )}</strong>
        <div class="reference-stats">
          <span>生命 ${escapeHtml(stats.maxHealth ?? "-")}</span>
          <span>攻击 ${escapeHtml(stats.attack ?? "-")}</span>
          <span>防御 ${escapeHtml(stats.defense ?? "-")}</span>
          <span>速度 ${escapeHtml(stats.moveSpeed ?? "-")}</span>
        </div>
        <p>属性来自角色配置；地图保存角色实例的位置与水平/垂直缩放。</p>
      </div>
    `;
  }

  buildItemFields(item) {
    const itemOptions = [
      '<option value="">请选择道具</option>',
      ...Object.values(this.catalogs.items ?? {}).map((itemDefinition) =>
        option(itemDefinition.id, itemDefinition.name, item.itemId)
      )
    ].join("");
    const definition = this.catalogs.items?.[item.itemId];

    return [
      section("道具实例", [
        field({
          label: "实例 ID",
          path: "instanceId",
          value: item.instanceId,
          note: "关卡内唯一"
        }),
        field({
          label: "道具定义",
          path: "itemId",
          value: item.itemId,
          options: itemOptions
        }),
        field({
          label: "数量",
          path: "quantity",
          value: item.quantity,
          type: "number",
          min: 1,
          step: 1
        })
      ].join("")),
      section(
        "位置",
        [
          field({
            label: "X",
            path: "x",
            value: item.x,
            type: "number",
            step: 1
          }),
          field({
            label: "Y",
            path: "y",
            value: item.y,
            type: "number",
            step: 1
          })
        ].join(""),
        "世界坐标"
      ),
      section(
        "尺寸",
        [
          field({
            label: "宽度",
            path: "width",
            value:
              item.width ?? definition?.appearance?.width ?? 26,
            type: "number",
            min: 1,
            step: 1
          }),
          field({
            label: "高度",
            path: "height",
            value:
              item.height ?? definition?.appearance?.height ?? 26,
            type: "number",
            min: 1,
            step: 1
          })
        ].join(""),
        "未绑定素材时可单向缩放"
      ),
      definition
        ? `
          <div class="reference-card">
            <strong>${escapeHtml(definition.name)}</strong>
            <p>${escapeHtml(definition.description ?? "无描述")}</p>
          </div>
        `
        : ""
    ].join("");
  }

  buildMechanismFields(level, mechanism) {
    const gateOptions = [
      option("", "无目标闸门", mechanism.targetGateId ?? ""),
      ...(level.mechanisms ?? [])
        .filter((item) => item.type === "gate")
        .map((gate) =>
        option(gate.id, `${gate.id}（闸门）`, mechanism.targetGateId)
        )
    ].join("");

    return [
      section("机关基础", [
        field({ label: "机关 ID", path: "id", value: mechanism.id }),
        field({
          label: "类型",
          path: "type",
          value: mechanism.type,
          options: option("switch", "switch · 开关", mechanism.type)
        }),
        field({
          label: "颜色",
          path: "color",
          value: mechanism.color,
          type: "color",
          wide: true
        })
      ].join("")),
      section("位置与尺寸", this.positionFields(mechanism), "中心点坐标"),
      section("交互与引用", [
        field({
          label: "交互范围",
          path: "interactionRange",
          value: mechanism.interactionRange,
          type: "number",
          min: 1,
          step: 1
        }),
        field({
          label: "目标闸门",
          path: "targetGateId",
          value: mechanism.targetGateId,
          options: gateOptions
        }),
        field({
          label: "剧情标记",
          path: "storyFlag",
          value: mechanism.storyFlag,
          wide: true
        }),
        field({
          label: "交互提示",
          path: "prompt",
          value: mechanism.prompt,
          type: "textarea",
          wide: true
        })
      ].join(""))
    ].join("");
  }

  buildGateFields(_level, gate) {
    return [
      section("闸门基础", [
        field({ label: "闸门 ID", path: "id", value: gate.id }),
        field({
          label: "颜色",
          path: "color",
          value: gate.color,
          type: "color"
        })
      ].join("")),
      section("位置与尺寸", this.positionFields(gate), "中心点坐标")
    ].join("");
  }

  buildEntranceFields(level, entrance) {
    const levels = this.knownLevels ?? [];
    const targetExit = levels
      .flatMap((knownLevel) =>
        (knownLevel.mechanisms ?? [])
          .filter((mechanism) => mechanism.type === "exit")
          .map((exit) => ({ knownLevel, exit }))
      )
      .find(({ exit }) => exit.id === entrance.targetExitId);
    const previousFilter = this.targetLevelFilters.get(entrance.id);
    const selectedLevelId =
      (levels.some((knownLevel) => knownLevel.id === previousFilter)
        ? previousFilter
        : targetExit?.knownLevel.id) ?? levels[0]?.id;
    this.targetLevelFilters.set(entrance.id, selectedLevelId);
    const selectedLevel = levels.find(
      (knownLevel) => knownLevel.id === selectedLevelId
    );
    const selectedExits = (selectedLevel?.mechanisms ?? []).filter(
      (mechanism) => mechanism.type === "exit"
    );
    const currentTargetIsVisible = selectedExits.some(
      (exit) => exit.id === entrance.targetExitId
    );
    const exitOptions = [
      option("", "未绑定出口", entrance.targetExitId ?? ""),
      ...(entrance.targetExitId && !currentTargetIsVisible
        ? [
            option(
              entrance.targetExitId,
              `${entrance.targetExitId} · 当前绑定`,
              entrance.targetExitId
            )
          ]
        : []),
      ...selectedExits.map((exit) =>
        option(exit.id, `${exit.id} · 出口`, entrance.targetExitId)
      )
    ].join("");
    const levelOptions = levels
      .map((knownLevel) =>
        option(
          knownLevel.id,
          `${knownLevel.id} · ${knownLevel.name}`,
          selectedLevelId
        )
      )
      .join("");

    return [
      section("入口基础", [
        field({ label: "入口 ID", path: "id", value: entrance.id }),
        field({
          label: "激活条件",
          path: "activation",
          value: entrance.activation,
          options: option(
            "player-center-touch",
            "角色中点接触边缘",
            entrance.activation
          )
        }),
        field({
          label: "颜色",
          path: "color",
          value: entrance.color,
          type: "color"
        })
      ].join("")),
      section("位置与尺寸", this.positionFields(entrance), "中心点坐标"),
      section("传送目标", [
        `
          <div class="field is-wide">
            <label><span>筛选关卡</span><span class="field-note">仅用于选择出口</span></label>
            <select data-target-level-filter>${levelOptions}</select>
          </div>
        `,
        field({
          label: "目标出口",
          path: "targetExitId",
          value: entrance.targetExitId,
          options: exitOptions,
          nullable: true,
          wide: true
        })
      ].join(""), "出口所在关卡自动判定")
    ].join("");
  }

  buildExitFields(_level, exit) {
    return [
      section("出口基础", [
        field({ label: "出口 ID", path: "id", value: exit.id }),
        field({
          label: "颜色",
          path: "color",
          value: exit.color,
          type: "color"
        })
      ].join("")),
      section("位置与尺寸", this.positionFields(exit), "中心点坐标"),
      `
        <div class="reference-card">
          <strong>被动传送目标</strong>
          <p>出口不会主动触发。入口激活后，角色会被传送到此出口范围。</p>
        </div>
      `
    ].join("");
  }

  positionFields(object) {
    return [
      field({
        label: "X",
        path: "x",
        value: object.x,
        type: "number",
        step: 1
      }),
      field({
        label: "Y",
        path: "y",
        value: object.y,
        type: "number",
        step: 1
      }),
      field({
        label: "宽度",
        path: "width",
        value: object.width,
        type: "number",
        min: 1,
        step: 1
      }),
      field({
        label: "高度",
        path: "height",
        value: object.height,
        type: "number",
        min: 1,
        step: 1
      })
    ].join("");
  }

  refreshValues(store) {
    const selection = store.selection;
    const target =
      !selection || selection.section === "level"
        ? store.document
        : getSelectedObject(store.document, selection);
    if (!target) {
      return;
    }

    for (const input of this.container.querySelectorAll("[data-path]")) {
      if (input === document.activeElement) {
        continue;
      }
      const value = getPathValue(target, input.dataset.path);
      if (input.tagName === "SELECT") {
        input.value =
          value === null || value === undefined ? "__null__" : String(value);
      } else {
        input.value = String(value ?? "");
      }
    }
  }
}
