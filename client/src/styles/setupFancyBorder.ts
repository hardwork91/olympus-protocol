// ============================================================================
// setupFancyBorder — genera un sprite 9-slice combinando corner.png +
// border.png con rotaciones (TL/TR/BR/BL para esquinas, top/right/bottom/left
// para edges). El resultado se expone como var CSS --fancy-border-image para
// que .fancy-border lo use con border-image.
//
// Llamar UNA VEZ al iniciar la app (en main.tsx).
// ============================================================================

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function setupFancyBorder(): Promise<void> {
  try {
    const [corner, edge] = await Promise.all([
      loadImage('/images/corner.png'),
      loadImage('/images/border.png'),
    ]);
    const W = corner.width; // corners asumidos cuadrados (W×W). Ej. 42
    const E = edge.width; // edge horizontal: ancho variable, alto = W

    const canvas = document.createElement('canvas');
    canvas.width = W + E + W;
    canvas.height = W + E + W;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawRotated = (img: HTMLImageElement, cx: number, cy: number, rad: number): void => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    };

    // TL corner (sin rotar) en (0, 0)
    ctx.drawImage(corner, 0, 0);
    // Top edge (sin rotar) en (W, 0)
    ctx.drawImage(edge, W, 0);
    // TR corner (90°)
    drawRotated(corner, W + E + W / 2, W / 2, Math.PI / 2);
    // Left edge (-90°)
    drawRotated(edge, W / 2, W + E / 2, -Math.PI / 2);
    // Right edge (90°)
    drawRotated(edge, W + E + W / 2, W + E / 2, Math.PI / 2);
    // BL corner (-90°)
    drawRotated(corner, W / 2, W + E + W / 2, -Math.PI / 2);
    // Bottom edge (180°)
    drawRotated(edge, W + E / 2, W + E + W / 2, Math.PI);
    // BR corner (180°)
    drawRotated(corner, W + E + W / 2, W + E + W / 2, Math.PI);

    const dataUrl = canvas.toDataURL('image/png');
    document.documentElement.style.setProperty('--fancy-border-image', `url(${dataUrl})`);
    document.documentElement.style.setProperty('--fancy-border-size', `${W}px`);
  } catch (e) {
    console.warn('Failed to build fancy border:', e);
  }
}
