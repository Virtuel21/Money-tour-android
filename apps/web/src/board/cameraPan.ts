import { OrthographicCamera, Plane, Ray, Vector3 } from 'three';

/** Move the camera's ground-plane focus so the board follows the finger in screen space. */
export function panFocus(
  camera: OrthographicCamera,
  focus: Vector3,
  dx: number,
  dy: number,
  width: number,
  height: number,
  bounds: { x: number; z: number },
): Vector3 {
  if (width <= 0 || height <= 0) return focus.clone();
  const plane = new Plane(new Vector3(0, 1, 0), -focus.y);
  const direction = camera.getWorldDirection(new Vector3());
  const at = (x: number, y: number) =>
    new Ray(new Vector3(x, y, -1).unproject(camera), direction).intersectPlane(
      plane,
      new Vector3(),
    );
  const start = at(0, 0),
    end = at((2 * dx) / width, (-2 * dy) / height);
  if (!start || !end) return focus.clone();
  const next = focus.clone().add(start.sub(end));
  next.x = Math.max(-bounds.x, Math.min(bounds.x, next.x));
  next.z = Math.max(-bounds.z, Math.min(bounds.z, next.z));
  return next;
}
