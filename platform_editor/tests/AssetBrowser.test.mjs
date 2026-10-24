import assert from "node:assert/strict";
import test from "node:test";
import { AssetBrowser } from "../src/editor/AssetBrowser.js";

class FakeElement {
  constructor() {
    this.innerHTML = "";
    this.textContent = "";
    this.hidden = false;
    this.listeners = new Map();
    this.classList = {
      toggle() {}
    };
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelectorAll() {
    return [];
  }
}

const payload = {
  assets: {
    static: [
      {
        id: "static:potion.png",
        fileName: "potion.png",
        displayName: "药剂",
        relativePath: "map/static-textures/potion.png",
        folderId: null,
        url: "/assets/map/static-textures/potion.png",
        size: 2048
      }
    ],
    entity: [
      {
        id: "entity:run.png",
        fileName: "run.png",
        displayName: "跑步",
        relativePath: "map/entities/run.png",
        folderId: "entity-folder-0001",
        url: "/assets/map/entities/run.png",
        size: 4096,
        frameCount: 4,
        frameRate: 10
      }
    ]
  },
  folders: {
    static: [],
    entity: [
      {
        id: "entity-folder-0001",
        name: "角色",
        parentId: null,
        assetCount: 1
      }
    ]
  }
};

function withFetch(callback) {
  return async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => payload
    });
    try {
      await callback();
    } finally {
      globalThis.fetch = originalFetch;
    }
  };
}

test(
  "静态贴图浏览器展示素材并回传相对路径",
  withFetch(async () => {
    const breadcrumb = new FakeElement();
    const summary = new FakeElement();
    const grid = new FakeElement();
    let chosen = null;
    const browser = new AssetBrowser({
      breadcrumb,
      summary,
      grid,
      empty: new FakeElement(),
      emptyTitle: new FakeElement(),
      emptyDescription: new FakeElement(),
      status: new FakeElement(),
      categories: [
        {
          id: "static",
          label: "静态贴图",
          actionLabel: "使用此插图"
        }
      ],
      onChoose: (asset) => {
        chosen = asset;
      }
    });
    await browser.open({ currentAssetId: "" });

    assert.match(
      grid.innerHTML,
      /data-asset-browser-asset="map\/static-textures\/potion.png"/
    );
    assert.match(grid.innerHTML, /使用此插图/);
    assert.match(breadcrumb.innerHTML, /静态贴图/);

    browser.selectAsset(browser.getActiveAssets()[0]);
    assert.equal(
      chosen.relativePath,
      "map/static-textures/potion.png"
    );
    assert.equal(chosen.folderPath, "");
  })
);

test(
  "动画浏览器先展示文件夹，进入后展示素材并保留文件夹路径",
  withFetch(async () => {
    const breadcrumb = new FakeElement();
    const summary = new FakeElement();
    const grid = new FakeElement();
    let chosen = null;
    const browser = new AssetBrowser({
      breadcrumb,
      summary,
      grid,
      empty: new FakeElement(),
      emptyTitle: new FakeElement(),
      emptyDescription: new FakeElement(),
      status: new FakeElement(),
      categories: [
        {
          id: "entity",
          label: "动画",
          actionLabel: "选择此动画"
        }
      ],
      onChoose: (asset) => {
        chosen = asset;
      }
    });
    await browser.open({ currentAssetId: "" });

    assert.match(
      grid.innerHTML,
      /data-asset-browser-folder="entity-folder-0001"/
    );
    assert.doesNotMatch(
      grid.innerHTML,
      /data-asset-browser-asset="map\/entities\/run.png"/
    );

    browser.setFolder("entity-folder-0001");
    assert.match(
      grid.innerHTML,
      /data-asset-browser-asset="map\/entities\/run.png"/
    );
    browser.selectAsset(browser.getActiveAssets()[0]);
    assert.equal(chosen.folderId, "entity-folder-0001");
    assert.equal(chosen.folderPath, "角色");
  })
);
