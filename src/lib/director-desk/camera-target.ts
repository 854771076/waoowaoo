import type { DirectorObject } from './schema';

export function getDirectorObjectFocusTarget(object: DirectorObject): [number, number, number] {
  const [x, y, z] = object.transform.position;
  if (object.kind === 'character') {
    return [x, Number((y + 1.05).toFixed(3)), z];
  }
  if (object.kind === 'crowd') {
    return [x, Number((y + 0.9).toFixed(3)), z];
  }
  return [x, Number((y + 0.6).toFixed(3)), z];
}

