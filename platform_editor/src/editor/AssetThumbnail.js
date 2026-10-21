const MAX_BOUNDS_SAMPLE_SIZE = 1024;
const ALPHA_THRESHOLD = 8;

export async function loadAssetImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

function getSampleSize(width, height) {
  const scale = Math.min(
    1,
    MAX_BOUNDS_SAMPLE_SIZE / Math.max(width, height)
  );
  return {
    scale,
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

export function getOpaqueContentBounds(
  image,
  {
    frameWidth = image.naturalWidth || image.width,
    frameHeight = image.naturalHeight || image.height,
    frameCount = 1
  } = {}
) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const sample = getSampleSize(imageWidth, imageHeight);
  const canvas = document.createElement("canvas");
  canvas.width = sample.width;
  canvas.height = sample.height;
  const context = canvas.getContext("2d", {
    willReadFrequently: true
  });
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(
    0,
    0,
    sample.width,
    sample.height
  ).data;

  let left = Infinity;
  let top = Infinity;
  let right = -1;
  let bottom = -1;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const frameStartX = Math.round(
      frameIndex * frameWidth * sample.scale
    );
    const frameEndX = Math.min(
      sample.width,
      Math.round((frameIndex + 1) * frameWidth * sample.scale)
    );
    let frameLeft = Infinity;
    let frameTop = Infinity;
    let frameRight = -1;
    let frameBottom = -1;

    for (let y = 0; y < sample.height; y += 1) {
      for (let x = frameStartX; x < frameEndX; x += 1) {
        const alphaIndex = (y * sample.width + x) * 4 + 3;
        if (pixels[alphaIndex] <= ALPHA_THRESHOLD) {
          continue;
        }
        frameLeft = Math.min(frameLeft, x - frameStartX);
        frameTop = Math.min(frameTop, y);
        frameRight = Math.max(frameRight, x - frameStartX);
        frameBottom = Math.max(frameBottom, y);
      }
    }

    if (frameRight >= frameLeft) {
      left = Math.min(left, frameLeft);
      top = Math.min(top, frameTop);
      right = Math.max(right, frameRight);
      bottom = Math.max(bottom, frameBottom);
    }
  }

  if (right < left || bottom < top) {
    return {
      x: 0,
      y: 0,
      width: frameWidth,
      height: frameHeight
    };
  }

  const x = Math.max(0, Math.floor(left / sample.scale));
  const y = Math.max(0, Math.floor(top / sample.scale));
  const rightEdge = Math.min(
    frameWidth,
    Math.ceil((right + 1) / sample.scale)
  );
  const bottomEdge = Math.min(
    frameHeight,
    Math.ceil((bottom + 1) / sample.scale)
  );
  return {
    x,
    y,
    width: Math.max(1, rightEdge - x),
    height: Math.max(1, bottomEdge - y)
  };
}

export class ImageThumbnail {
  constructor(canvas, { url }) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.url = url;
  }

  async start() {
    const image = await loadAssetImage(this.url);
    const bounds = getOpaqueContentBounds(image);
    this.canvas.width = bounds.width;
    this.canvas.height = bounds.height;
    this.context.imageSmoothingEnabled = false;
    this.context.clearRect(
      0,
      0,
      bounds.width,
      bounds.height
    );
    this.context.drawImage(
      image,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height
    );
  }
}
