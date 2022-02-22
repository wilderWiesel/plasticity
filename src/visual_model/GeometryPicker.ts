import * as THREE from "three";
import { Viewport } from "../components/viewport/Viewport";
import LayerManager from "../editor/LayerManager";
import * as intersectable from "./Intersectable";
import { ControlPoint, Curve3D, CurveEdge, Face, Region } from "./VisualModel";
import * as visual from '../visual_model/VisualModel';

type IntersectableWithTopologyItem = THREE.Intersection<intersectable.Raycastable> & {
    topologyItem: visual.TopologyItem;
};

export class GeometryPicker {
    private readonly raycaster = new THREE.Raycaster();

    constructor(
        private readonly layers: LayerManager,
        private readonly raycasterParams: THREE.RaycasterParameters,
    ) {
        this.raycaster.layers = layers.visible as THREE.Layers;
    }

    intersect(objects: THREE.Object3D[], isXRay = this.viewport.isXRay): intersectable.Intersection[] {
        const { raycaster } = this;

        this.raycaster.params = this.raycasterParams;

        let intersections = raycaster.intersectObjects(objects, false) as IntersectableWithTopologyItem[];
        if (!isXRay) {
            intersections = findAllVeryCloseTogether(intersections) as IntersectableWithTopologyItem[];
        }
        const sorted = intersections.sort(sort);
        return raycastable2intersectable(sorted);
    }

    private viewport!: Viewport;
    setFromViewport(normalizedScreenPoint: THREE.Vector2, viewport: Viewport) {
        this.raycaster.setFromCamera(normalizedScreenPoint, viewport.camera);
        this.viewport = viewport;
    }

}

function findAllVeryCloseTogether(intersections: THREE.Intersection<intersectable.Raycastable>[]) {
    if (intersections.length === 0) return [];

    const nearest = intersections[0];
    const result = [];
    for (const intersection of intersections) {
        if (Math.abs(nearest.distance - intersection.distance) < 10e-2) {
            result.push(intersection);
        }
    }
    return result;
}

function sort(i1: IntersectableWithTopologyItem, i2: IntersectableWithTopologyItem) {
    const o1 = i1.object, o2 = i2.object;
    let p1 = o1.priority, p2 = o2.priority;
    if (o1 instanceof intersectable.RaycastableTopologyItem) p1 = i1.topologyItem.priority
    if (o2 instanceof intersectable.RaycastableTopologyItem) p1 = i2.topologyItem.priority
    if (p1 === p2) {
        if (o1 instanceof CurveEdge && o2 instanceof CurveEdge) {
            // @ts-expect-error
            return i1.point.distanceToSquared(i1.pointOnLine) - i2.point.distanceToSquared(i2.pointOnLine);
        } else return 0;
    } else return p1 - p2;
}

declare module './VisualModel' {
    interface ControlPoint { priority: number }
    interface TopologyItem { priority: number }
    interface SpaceItem { priority: number }
    interface PlaneItem { priority: number }
}

ControlPoint.prototype.priority = 1;
Curve3D.prototype.priority = 2;
CurveEdge.prototype.priority = 3;
Region.prototype.priority = 4;
Face.prototype.priority = 5;

function raycastable2intersectable(sorted: THREE.Intersection<intersectable.Raycastable>[]): intersectable.Intersection[] {
    const result = [];
    for (const intersection of sorted) {
        const object = intersection.object;
        const i = object instanceof intersectable.RaycastableTopologyItem
            // @ts-expect-error
            ? intersection.topologyItem
            : object;
        result.push({ ...intersection, object: i });
    }
    return result;
}

