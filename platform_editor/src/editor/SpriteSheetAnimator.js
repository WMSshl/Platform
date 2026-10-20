export class SpriteSheetAnimator {
  constructor(
    canvas,
    {
      url,
      frameWidth,
      frameHeight,
      frameCount,
      frameRate = 8
    }
  ) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.url = url;
    this.frameWidth = Math.max(1, Number(frameWidth) || 1);
    this.frameHeight = Math.max(1, Number(frameHeight) || 1);
    this.frameCount = Math.max(1, Number(frameCount) || 1);
    this.frameRate = Math.max(1, Number(frameRate) || 8);
    this.frameIndex = 0;
    this.lastFrameAt = 0;
    this.animationFrame = null;
    this.running = false;
    this.image = null;
    this.ready = this.load();
  }

  async load() {
    const image = new Image();
    image.src = this.url;
    await image.decode();
    this.image = image;
    this.canvas.width = this.frameWidth;
    this.canvas.height = this.frameHeight;
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
      this.frameIndex =
        (this.frameIndex + advance) % this.frameCount;
      this.lastFrameAt = time;
      this.draw();
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
      this.frameWidth,
      this.frameHeight
    );
    this.context.drawImage(
      this.image,
      this.frameIndex * this.frameWidth,
      0,
      this.frameWidth,
      this.frameHeight,
      0,
      0,
      this.frameWidth,
      this.frameHeight
    );
  }
}
