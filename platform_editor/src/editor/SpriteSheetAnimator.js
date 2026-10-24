export function hasReachedAnimationFrame(
  previousFrameIndex,
  frameIndex,
  frameCount,
  targetFrameIndex,
  advance = 1
) {
  const count = Math.floor(Number(frameCount));
  const target = Math.floor(Number(targetFrameIndex));
  if (
    !Number.isFinite(count) ||
    count <= 0 ||
    !Number.isFinite(target) ||
    target < 0 ||
    target >= count
  ) {
    return false;
  }
  if (Math.floor(Number(advance)) >= count) {
    return true;
  }
  const previous =
    ((Math.floor(Number(previousFrameIndex)) || 0) % count + count) %
    count;
  const current =
    ((Math.floor(Number(frameIndex)) || 0) % count + count) % count;
  if (current === target) {
    return true;
  }
  const steps = (current - previous + count) % count;
  const targetSteps = (target - previous + count) % count;
  return steps > 0 && targetSteps > 0 && targetSteps <= steps;
}

export class SpriteSheetAnimator {
  constructor(
    canvas,
    {
      url,
      frameWidth,
      frameHeight,
      frameCount,
      frameRate = 8,
      contentBounds = null,
      onFrameChange = null
    }
  ) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.url = url;
    this.frameWidth = Math.max(1, Number(frameWidth) || 1);
    this.frameHeight = Math.max(1, Number(frameHeight) || 1);
    this.frameCount = Math.max(1, Number(frameCount) || 1);
    this.frameRate = Math.max(1, Number(frameRate) || 8);
    this.contentBounds = contentBounds;
    this.onFrameChange = onFrameChange;
    this.drawWidth = Math.max(
      1,
      Number(contentBounds?.width) || this.frameWidth
    );
    this.drawHeight = Math.max(
      1,
      Number(contentBounds?.height) || this.frameHeight
    );
    this.frameIndex = 0;
    this.lastFrameAt = 0;
    this.animationFrame = null;
    this.running = false;
    this.mirrored = false;
    this.image = null;
    this.ready = this.load();
  }

  async load() {
    const image = new Image();
    image.src = this.url;
    await image.decode();
    this.image = image;
    this.canvas.width = this.drawWidth;
    this.canvas.height = this.drawHeight;
    this.context.imageSmoothingEnabled = false;
    this.draw();
    return this;
  }

  async start() {
    if (this.running) {
      return;
    }
    await this.ready;
    this.running = true;
    this.lastFrameAt = performance.now();
    this.animationFrame = requestAnimationFrame((time) =>
      this.tick(time)
    );
  }

  stop() {
    this.running = false;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  setFrameRate(frameRate) {
    this.frameRate = Math.max(1, Number(frameRate) || 8);
  }

  setFrameCount(frameCount) {
    this.frameCount = Math.max(1, Number(frameCount) || 1);
    this.frameIndex %= this.frameCount;
  }

  setMirrored(mirrored) {
    this.mirrored = Boolean(mirrored);
    this.draw();
  }

  tick(time) {
    if (!this.running) {
      return;
    }
    const frameDuration = 1000 / this.frameRate;
    if (time - this.lastFrameAt >= frameDuration) {
      const advance = Math.max(
        1,
        Math.floor((time - this.lastFrameAt) / frameDuration)
      );
      const previousFrameIndex = this.frameIndex;
      this.frameIndex =
        (this.frameIndex + advance) % this.frameCount;
      this.lastFrameAt = time;
      this.draw();
      try {
        this.onFrameChange?.({
          previousFrameIndex,
          frameIndex: this.frameIndex,
          frameCount: this.frameCount,
          advance
        });
      } catch (error) {
        console.warn("动画帧回调失败", error);
      }
    }
    this.animationFrame = requestAnimationFrame((nextTime) =>
      this.tick(nextTime)
    );
  }

  draw() {
    if (!this.image || !this.context) {
      return;
    }
    this.context.clearRect(
      0,
      0,
      this.drawWidth,
      this.drawHeight
    );
    const sourceX =
      this.frameIndex * this.frameWidth +
      (this.contentBounds?.x ?? 0);
    const sourceY = this.contentBounds?.y ?? 0;
    if (this.mirrored) {
      this.context.save();
      this.context.translate(this.drawWidth, 0);
      this.context.scale(-1, 1);
      this.context.drawImage(
        this.image,
        sourceX,
        sourceY,
        this.drawWidth,
        this.drawHeight,
        0,
        0,
        this.drawWidth,
        this.drawHeight
      );
      this.context.restore();
      return;
    }
    this.context.drawImage(
      this.image,
      sourceX,
      sourceY,
      this.drawWidth,
      this.drawHeight,
      0,
      0,
      this.drawWidth,
      this.drawHeight
    );
  }
}
