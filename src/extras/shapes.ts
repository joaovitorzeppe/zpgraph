/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * @fileoverview
 * Including this file will add several additional shapes to Zpgraph.Circles
 * which can be passed to drawPointCallback.
 * See tests/custom-circles.html for usage.
 */

import ZpgraphImport from "zpgraph";
import type { DrawPointCallback } from "../types";

type ZpgraphCirclesHost = {
  Circles: Record<string, DrawPointCallback> & { DEFAULT: DrawPointCallback };
};

const Zpgraph = ZpgraphImport as ZpgraphCirclesHost;

/**
 * @param ctx the canvas context
 * @param sides the number of sides in the shape.
 * @param radius the radius of the image.
 * @param cx center x coordate
 * @param cy center y coordinate
 * @param rotationRadians the shift of the initial angle, in radians.
 * @param delta the angle shift for each line. If missing, creates a
 *     regular polygon.
 */
const regularShape = (
  ctx: CanvasRenderingContext2D,
  sides: number,
  radius: number,
  cx: number,
  cy: number,
  rotationRadians: number,
  delta: number,
) => {
  ctx.beginPath();
  const initialAngle = rotationRadians;
  let angle = initialAngle;

  const computeCoordinates = () => {
    const x = cx + Math.sin(angle) * radius;
    const y = cy + -Math.cos(angle) * radius;
    return [x, y] as const;
  };

  const initialCoordinates = computeCoordinates();
  ctx.moveTo(initialCoordinates[0], initialCoordinates[1]);

  for (let idx = 0; idx < sides; idx++) {
    angle = idx === sides - 1 ? initialAngle : angle + delta;
    const coords = computeCoordinates();
    ctx.lineTo(coords[0], coords[1]);
  }
  ctx.fill();
  ctx.stroke();
};

/**
 * @param sides
 * @param rotationRadians
 * @param delta
 * @return * @private
 */
const shapeFunction = (
  sides: number,
  rotationRadians = 0,
  delta = (Math.PI * 2) / sides,
): DrawPointCallback => {
  return (_g, _name, ctx, cx, cy, color, radius) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = "white";
    regularShape(ctx, sides, radius, cx, cy, rotationRadians, delta);
  };
};

const customCircles: Record<string, DrawPointCallback> = {
  TRIANGLE: shapeFunction(3),
  SQUARE: shapeFunction(4, Math.PI / 4),
  DIAMOND: shapeFunction(4),
  PENTAGON: shapeFunction(5),
  HEXAGON: shapeFunction(6),
  CIRCLE: (_g, _name, ctx, cx, cy, color, radius) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.fillStyle = "white";
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI, false);
    ctx.fill();
    ctx.stroke();
  },
  STAR: shapeFunction(5, 0, (4 * Math.PI) / 5),
  PLUS: (_g, _name, ctx, cx, cy, color, radius) => {
    ctx.strokeStyle = color;

    ctx.beginPath();
    ctx.moveTo(cx + radius, cy);
    ctx.lineTo(cx - radius, cy);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy + radius);
    ctx.lineTo(cx, cy - radius);
    ctx.closePath();
    ctx.stroke();
  },
  EX: (_g, _name, ctx, cx, cy, color, radius) => {
    ctx.strokeStyle = color;

    ctx.beginPath();
    ctx.moveTo(cx + radius, cy + radius);
    ctx.lineTo(cx - radius, cy - radius);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + radius, cy - radius);
    ctx.lineTo(cx - radius, cy + radius);
    ctx.closePath();
    ctx.stroke();
  },
};

for (const k in customCircles) {
  if (!Object.hasOwn(customCircles, k)) {
    continue;
  }
  Zpgraph.Circles[k] = customCircles[k]!;
}

export default Zpgraph.Circles;
