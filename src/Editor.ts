import * as THREE from "three";
import signals from "signals";
import Command from './commands/Command';
import c3d from '../build/Release/c3d.node';
import MaterialDatabase from "./MaterialDatabase";

THREE.Object3D.DefaultUp = new THREE.Vector3(0, 0, 1);

interface EditorSignals {
    objectAdded: signals.Signal<THREE.Object3D>;
    objectSelected: signals.Signal<THREE.Object3D>;
    objectDeselected: signals.Signal<THREE.Object3D>;
    sceneGraphChanged: signals.Signal;
    commandUpdated: signals.Signal;
    pointPickerChanged: signals.Signal;
    windowResized: signals.Signal;
    windowLoaded: signals.Signal;
    rendererAdded: signals.Signal<THREE.Renderer>;
}

interface Viewport {
    renderer: THREE.Renderer;
    camera: THREE.Camera;
    constructionPlane: THREE.Mesh;
}

export class Editor {
    readonly viewports: Viewport[] = [];

    readonly signals: EditorSignals = {
        objectAdded: new signals.Signal(),
        objectSelected: new signals.Signal(),
        objectDeselected: new signals.Signal(),
        sceneGraphChanged: new signals.Signal(),
        commandUpdated: new signals.Signal(),
        pointPickerChanged: new signals.Signal(),
        windowResized: new signals.Signal(),
        windowLoaded: new signals.Signal(),
        rendererAdded: new signals.Signal()
    }

    readonly geometryModel = new c3d.Model();
    readonly drawModel = new Set<THREE.Object3D>();
    readonly materialDatabase = new MaterialDatabase();
    readonly scene = new THREE.Scene();
    selected?: THREE.Object3D; // FIXME readonly

    constructor() {
        // FIXME dispose of these:
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        window.addEventListener('load', this.onWindowLoad.bind(this), false);

        const axis = new THREE.AxesHelper(300);
        this.scene.add(axis);

        this.signals.objectSelected.add(this.objectSelected);
        this.signals.objectDeselected.add(this.objectDeselected);
    }

    execute(command: Command) {
        command.execute();
    }

    addObject(object: THREE.Object3D | c3d.Item) {
        if (object instanceof THREE.Object3D) {
            // FIXME since these are temporary objects, consider moving this to another function
            this.scene.add(object);
        } else if (object instanceof c3d.Item) {
            const mesh = this.object2mesh(object);
            const o = this.geometryModel.AddItem(object);
            mesh.userData.simpleName = o.GetItemName();
            mesh.userData.modelType = 'item';

            this.scene.add(mesh);
            this.drawModel.add(mesh);

            this.signals.objectAdded.dispatch(mesh);
            this.signals.sceneGraphChanged.dispatch();
        }
    }

    lookup(object: THREE.Object3D): c3d.Item {
        const { item } =  this.geometryModel.GetItemByName(object.userData.simpleName);
        return item;
    }

    object2mesh(obj: c3d.Item) {
        const stepData = new c3d.StepData(c3d.StepType.SpaceStep, 0.005);
        const note = new c3d.FormNote(false, true, true, false, false);
        const item = obj.CreateMesh(stepData, note, null);
        if (item.IsA() != c3d.SpaceType.Mesh) throw "Unexpected return type";
        const mesh = item.Cast<c3d.Mesh>(c3d.SpaceType.Mesh);
        const group = new THREE.Group();
        switch (mesh.GetMeshType()) {
            case c3d.SpaceType.Curve3D:
                const edges = mesh.GetEdges();
                for (const edge of edges) {
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
                    const line = new THREE.Line(geometry, this.materialDatabase.line(obj));
                    group.add(line);
                }
                return group;
            case c3d.SpaceType.Point3D:
                const apexes = mesh.GetApexes();
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(apexes, 3));
                const points = new THREE.Points(geometry, this.materialDatabase.point(obj));
                return points;
            default:
                const grids = mesh.GetBuffers();
                for (const grid of grids) {
                    const gridMaterial = this.materialDatabase.mesh(grid, mesh.IsClosed());
                    const geometry = new THREE.BufferGeometry();
                    geometry.setIndex(new THREE.BufferAttribute(grid.index, 1));
                    geometry.setAttribute('position', new THREE.BufferAttribute(grid.position, 3));
                    geometry.setAttribute('normal', new THREE.BufferAttribute(grid.normal, 3));
                    const gridMesh = new THREE.Mesh(geometry, gridMaterial);
                    gridMesh.userData.name = grid.name;
                    gridMesh.userData.simpleName = grid.simpleName;
                    gridMesh.userData.modelType = 'grid';
                    group.add(gridMesh);
                }
                return group;
        }
    }

    select(object: THREE.Mesh) {
        if (this.selected === object) return;

        this.signals.objectDeselected.dispatch(this.selected);
        this.selected = object;
        this.signals.objectSelected.dispatch(object);
    }

    objectSelected(object: THREE.Object3D) {
        if (object != null) {
            const material = object.material;
            if (material.hasOwnProperty('color')) {
                material.color.setHex(0xff0000);
            }
        }
    }

    objectDeselected(object: THREE.Object3D) {
        if (object != null) {
            object.material.color.setHex(0xffffff);
        }
    }

    onWindowResize() {
        this.signals.windowResized.dispatch();
    }

    onWindowLoad() {
        this.signals.windowLoaded.dispatch();
    }

}