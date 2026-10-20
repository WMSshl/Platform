export class EditorTypeRegistry {
  constructor(kind) {
    this.kind = kind;
    this.definitions = new Map();
  }

  register(definition) {
    const key =
      this.kind === "mechanism"
        ? definition.type
        : definition.tool;
    if (!key) {
      throw new Error(`注册 ${this.kind} 类型时必须提供稳定 key`);
    }
    if (this.definitions.has(key)) {
      throw new Error(`${this.kind} 类型 ${key} 已经注册`);
    }
    this.definitions.set(key, Object.freeze(definition));
    return definition;
  }

  get(key) {
    return this.definitions.get(key) ?? null;
  }

  values() {
    return [...this.definitions.values()];
  }
}

export const placementTypeRegistry = new EditorTypeRegistry("placement");
export const mechanismTypeRegistry = new EditorTypeRegistry("mechanism");
