import assert from "node:assert/strict";
import test from "node:test";
import {
  ITEM_CUSTOM_OPTION,
  addItemRarity,
  addItemType,
  createEmptyContentDocument,
  insertContentEntry
} from "../src/model/ContentModel.js";
import { ItemContentEditor } from "../src/editor/ItemContentEditor.js";

class FakeRoot {
  constructor() {
    this.innerHTML = "";
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelector() {
    return null;
  }
}

function createEditor(item) {
  const content = createEmptyContentDocument();
  const entry = {
    id: "02-0001",
    name: "测试物品",
    description: "",
    folderId: null,
    primaryType: "",
    secondaryType: "",
    rarity: "",
    stackLimit: 1,
    tradeable: true,
    buyPrice: 0,
    sellPrice: 0,
    effect: {
      mode: "description",
      description: "",
      script: ""
    },
    ...item
  };
  content.items.push(entry);
  content.idCounters.items = 1;
  const store = {
    selection: { moduleKey: "items", id: entry.id },
    document: content,
    update(mutator) {
      mutator(this.document);
      return true;
    }
  };
  const messages = [];
  const root = new FakeRoot();
  const editor = new ItemContentEditor(store, {
    root,
    onStatus: (message) => messages.push(["status", message]),
    onNotify: (message) => messages.push(["notify", message])
  });
  return { content, entry, editor, root, messages };
}

test("物品编辑区默认展示自定义类型、交易与效果结构", () => {
  const { editor, root } = createEditor();

  editor.render();

  assert.match(root.innerHTML, /data-item-field="primaryType"/);
  assert.match(root.innerHTML, /data-item-draft="primary"/);
  assert.match(root.innerHTML, /data-item-draft="secondary"/);
  assert.match(root.innerHTML, /data-item-draft="rarity"/);
  assert.match(root.innerHTML, /data-item-field="stackLimit"/);
  assert.match(root.innerHTML, /type="checkbox"[\s\S]*checked/);
  assert.match(root.innerHTML, /买入 \/ 卖出/);
  assert.match(root.innerHTML, /data-item-field="description"/);
  assert.match(root.innerHTML, /特殊效果实现/);
  assert.match(root.innerHTML, /效果描述/);
  assert.match(root.innerHTML, /data-item-field="effectDescription"/);
  assert.doesNotMatch(root.innerHTML, /data-item-field="effectScript"/);
});

test("物品插图展示路径、文件夹和移除操作", () => {
  const { entry, editor, root } = createEditor({
    illustration: {
      assetId: "static:potion.png",
      fileName: "potion.png",
      displayName: "药剂插图",
      relativePath: "map/static-textures/icons/potion.png",
      folderId: "static-folder-0001",
      folderPath: "图标 / 消耗品",
      revision: "rev-1"
    }
  });

  editor.render(entry);

  assert.match(root.innerHTML, /物品插图/);
  assert.match(
    root.innerHTML,
    /map\/static-textures\/icons\/potion\.png/
  );
  assert.match(
    root.innerHTML,
    /文件夹：图标 \/ 消耗品/
  );
  assert.match(
    root.innerHTML,
    /data-item-action="remove-illustration"/
  );
  assert.match(
    root.innerHTML,
    /\/assets\/map\/static-textures\/icons\/potion\.png\?v=rev-1/
  );
});

test("一级类型切到自定义时清空旧一级类型的二级候选", () => {
  const { content, entry, editor, root } = createEditor();
  addItemType(content, "消耗品", "恢复");
  entry.primaryType = "消耗品";
  entry.secondaryType = "恢复";
  editor.render(entry);

  editor.handleChange({
    target: {
      dataset: { itemField: "primaryType" },
      value: ITEM_CUSTOM_OPTION
    }
  });

  const secondarySelect =
    root.innerHTML.match(
      /data-item-field="secondaryType"[\s\S]*?<\/select>/
    )?.[0] ?? "";

  assert.match(secondarySelect, /自定义二级类型/);
  assert.doesNotMatch(secondarySelect, /恢复/);
  assert.match(
    root.innerHTML,
    /data-item-draft="secondary"/
  );
});

test("已选类型和关闭买卖后不再显示自定义输入", () => {
  const { content, entry, editor, root } = createEditor();
  addItemType(content, "消耗品", "恢复");
  addItemRarity(content, "普通");
  entry.primaryType = "消耗品";
  entry.secondaryType = "恢复";
  entry.rarity = "普通";
  entry.tradeable = false;
  entry.effect = {
    mode: "script",
    description: "触发脚本效果",
    script: "scripts/items/heal.js"
  };

  editor.render(entry);

  assert.doesNotMatch(root.innerHTML, /data-item-draft="primary"/);
  assert.doesNotMatch(root.innerHTML, /data-item-draft="secondary"/);
  assert.doesNotMatch(root.innerHTML, /data-item-draft="rarity"/);
  assert.match(root.innerHTML, /非买卖品/);
  assert.match(
    root.innerHTML,
    /data-item-field="effectScript"/
  );
  assert.match(root.innerHTML, /scripts\/items\/heal\.js/);
  assert.match(root.innerHTML, /触发脚本效果/);
});

test("确认自定义类型会写入共享类型库并回填物品", () => {
  const { content, entry, editor, root } = createEditor();
  editor.render(entry);
  editor.view.primaryCustom = true;
  editor.view.secondaryCustom = true;
  editor.view.primaryDraft = " 消耗品 ";
  editor.view.secondaryDraft = "恢复";

  editor.confirmType();

  assert.deepEqual(content.itemTypeLibrary, {
    primaryTypes: [
      {
        name: "消耗品",
        secondaryTypes: ["恢复"]
      }
    ],
    rarities: []
  });
  assert.equal(entry.primaryType, "消耗品");
  assert.equal(entry.secondaryType, "恢复");
  assert.equal(editor.view.primaryCustom, false);
  assert.equal(editor.view.secondaryCustom, false);
  assert.doesNotMatch(root.innerHTML, /data-item-draft="primary"/);
});

test("同名一级类型会合并，重复确认不会新增记录", () => {
  const { content, entry, editor } = createEditor();
  addItemType(content, "消耗品", "恢复");
  editor.render(entry);
  editor.view.primaryCustom = true;
  editor.view.secondaryCustom = true;
  editor.view.primaryDraft = "消耗品";
  editor.view.secondaryDraft = "增益";

  editor.confirmType();

  assert.equal(
    content.itemTypeLibrary.primaryTypes.length,
    1
  );
  assert.deepEqual(
    content.itemTypeLibrary.primaryTypes[0].secondaryTypes,
    ["恢复", "增益"]
  );
  assert.equal(entry.secondaryType, "增益");
});

test("确认稀有度会写入独立稀有度库", () => {
  const { content, entry, editor } = createEditor();
  editor.render(entry);
  editor.view.rarityCustom = true;
  editor.view.rarityDraft = "稀有";

  editor.confirmRarity();

  assert.deepEqual(content.itemTypeLibrary.rarities, ["稀有"]);
  assert.equal(entry.rarity, "稀有");
  assert.equal(editor.view.rarityCustom, false);
});
