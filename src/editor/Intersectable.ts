import * as THREE from "three";
import { BetterRaycastingPoint } from '../util/BetterRaycastingPoints';
import { ControlPoint, ControlPointGroup, Curve3D, CurveSegment, Layers, Region, Solid, TopologyItem } from "./VisualModel";
import * as visual from './VisualModel';
import { IntersectableLayers } from "./LayerManager";

// It's important to conceptually distinguish intersectable objects from selectable objects
// Selectable objects are what the user actually stores in a selection (e.g., a SpaceInstance<Curve3D>)
// whereas the user actually clicks on (intersects) a CurveFragment (and it's child mesh).

export type Intersectable = Curve3D | TopologyItem | ControlPoint | Region;

// The following two methods are used for raycast (point and click) and box selection --
// They take primitive view objects (Line2, Mesh, etc.), filter out the irrelevant (invisible, etc.),
// and return higher level view objects (Face, CurveEdge, Region, etc.).

export function filterMeshes(selected: THREE.Mesh[]): Set<Intersectable> {
    const result = new Set<Intersectable>();
    for (const object of selected) {
        if (!isSelectable(object)) continue;

        const intersectable = findIntersectable(object);
        result.add(intersectable);
    }
    return result;
}

export interface Intersection {
    object: Intersectable;
    point: THREE.Vector3;
}

function isSelectable(object: THREE.Object3D): boolean {
    if (!object.layers.test(IntersectableLayers)) return false;

    let parent: THREE.Object3D | null = object;
    while (parent) {
        if (!parent.visible) return false;
        parent = parent.parent;
    }
    return true;
}

function findIntersectable(object: THREE.Object3D, index?: number): Intersectable {
    if (object instanceof BetterRaycastingPoint) {
        const controlPointGroup = object.parent.parent! as ControlPointGroup;
        if (!(controlPointGroup instanceof ControlPointGroup))
            throw new Error("invalid precondition: " + parent.constructor.name);
        return controlPointGroup.findByIndex(object.index)!;
    } else {
        const parent = object.parent!;
        if (parent instanceof Solid || parent instanceof TopologyItem || parent instanceof Region)
            return parent as Intersectable;
        if (parent instanceof CurveSegment)
            return parent.parent!.parent! as Curve3D;

        throw new Error("invalid precondition: " + parent.constructor.name);
    }
}


const priorities = new Map<any, number>();
priorities.set(visual.ControlPoint, 0);
priorities.set(visual.Curve3D, 1);
priorities.set(visual.CurveEdge, 2);
priorities.set(visual.Region, 3);
priorities.set(visual.Face, 4);

export const xray = new THREE.Layers();
xray.disableAll();
xray.enable(Layers.XRay);
xray.enable(Layers.CurveFragment_XRay);
function sortIntersections(ii1: [THREE.Intersection, Intersectable], ii2: [THREE.Intersection, Intersectable]) {
    const [i1, intersectable1] = ii1;
    const [i2, intersectable2] = ii2;

    const x = priorities.get(intersectable1.constructor);
    const y = priorities.get(intersectable2.constructor);
    if (x === undefined || y === undefined) {
        console.error(intersectable1.constructor.name);
        console.error(intersectable2.constructor.name);
        throw new Error("invalid precondition");
    }

    if (i1.object.layers.test(xray) && x <= y) return -1;
    if (i2.object.layers.test(xray) && y <= x) return 1;

    const delta = i1.distance - i2.distance;
    if (Math.abs(delta) < 10e-3) {
        return x - y;
    } else {
        return delta;
    }
}