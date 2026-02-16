import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import gsap from 'gsap'; // Certifique-se de ter o GSAP instalado

/**
 * Configurações Gerais da Aplicação
 * Centraliza "Magic Numbers" para fácil edição futura.
 */
const CONFIG = {
    camera: {
        fov: 45,
        near: 0.1,
        far: 100,
        initialPos: { x: 0, y: 10, z: 15 },
        targetPos: { x: 5, y: 2, z: 5 },
    },
    controls: {
        minDist: 2,
        maxDist: 8,
        autoRotateSpeed: 1.0,
        idleTimeBeforeRotate: 5000,
    },
    assets: {
        envMap: '/public/empty_warehouse_01_4k.hdr',
        model: '/public/1985_toyota_sprinter_trueno_ae86/scene.gltf', // ou URL externa
        scale: 70
    },
    colors: {
        selectionEmissive: 0x333333,
        clickFlash: 0xffffff,
        defaultEmissive: 0x000000
    }
};

class CarConfigurator {
    constructor(containerElement) {
        this.container = containerElement;
        
        // Estado da Aplicação
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.model = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // Estado de Interação
        this.hoveredObject = null;
        this.selectedPartName = null;
        this.idleTimeout = null;
        this.isIntroComplete = false;

        // Elementos de UI (Cache)
        this.ui = {
            loader: document.getElementById('loader'),
            loadingScreen: document.getElementById('loading-screen'),
            partLabel: document.getElementById('selected-part'),
            colorPicker: document.getElementById('html-color-picker')
        };

        this.init();
    }

    async init() {
        this.setupRenderer();
        this.setupScene();
        this.setupCamera();
        this.setupControls();
        this.setupLights();
        
        // Event Listeners Globais
        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('click', () => this.onClick());

        try {
            await this.loadAssets();
            this.startIntro();
            this.animate();
        } catch (error) {
            console.error("Erro fatal ao carregar a experiência:", error);
            this.ui.loader.innerText = "Erro ao carregar.";
        }
    }

    // --- 1. SETUP DO AMBIENTE 3D ---

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Performance fix
        
        // Configuração de Cor (Workflow PBR)
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1;

        this.container.appendChild(this.renderer.domElement);
    }

    setupScene() {
        this.scene = new THREE.Scene();
    }

    setupCamera() {
        const { fov, near, far, initialPos } = CONFIG.camera;
        this.camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far);
        this.camera.position.set(initialPos.x, initialPos.y, initialPos.z);
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enabled = false; // Começa travado
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = CONFIG.controls.autoRotateSpeed;
        this.controls.enableDamping = true;
        this.controls.minDistance = CONFIG.controls.minDist;
        this.controls.maxDistance = CONFIG.controls.maxDist;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
        this.controls.enablePan = false;
        
        // Lógica de "Idle" (Voltar a girar se parado)
        this.controls.addEventListener('start', () => this.resetIdleTimer());
        this.controls.addEventListener('end', () => this.resetIdleTimer());
    }

    setupLights() {
        // Luzes adicionais se necessário, mas o HDRI já faz o trabalho pesado
    }

    // --- 2. CARREGAMENTO DE ASSETS (PROMISE BASED) ---

    async loadAssets() {
        const manager = new THREE.LoadingManager();
        
        manager.onProgress = (url, itemsLoaded, itemsTotal) => {
            const progress = ((itemsLoaded / itemsTotal) * 100).toFixed(0);
            if (this.ui.loader) this.ui.loader.innerText = `Carregando... ${progress}%`;
        };

        const rgbeLoader = new RGBELoader(manager);
        const gltfLoader = new GLTFLoader(manager);

        // Carregar HDRI e Modelo em paralelo
        const [texture, gltf] = await Promise.all([
            rgbeLoader.loadAsync(CONFIG.assets.envMap),
            gltfLoader.loadAsync(CONFIG.assets.model)
        ]);

        // Configurar Ambiente
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.scene.environment = texture;
        this.scene.background = texture; // Opcional

        // Configurar Modelo
        this.model = gltf.scene;
        this.model.scale.setScalar(CONFIG.assets.scale);
        this.model.position.y = -0.5;

        // Percorrer modelo para logs e otimizações iniciais
        this.model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Otimização: Garantir que o material esteja pronto para envMap
                if (child.material) child.material.envMapIntensity = 1;
            }
        });

        this.scene.add(this.model);

        // Remover Loading Screen
        if (this.ui.loadingScreen) {
            gsap.to(this.ui.loadingScreen, { opacity: 0, duration: 0.5, onComplete: () => {
                this.ui.loadingScreen.remove();
            }});
        }
    }

    // --- 3. LÓGICA DE INTRODUÇÃO E ANIMAÇÃO ---

    startIntro() {
        const { targetPos } = CONFIG.camera;

        gsap.to(this.camera.position, {
            x: targetPos.x,
            y: targetPos.y,
            z: targetPos.z,
            duration: 2.5,
            ease: "power3.out",
            onUpdate: () => this.controls.update(), // Importante para orbitControls não travar
            onComplete: () => {
                this.controls.enabled = true;
                this.controls.autoRotate = false;
                this.isIntroComplete = true;
                this.resetIdleTimer();
            }
        });
    }

    resetIdleTimer() {
        this.controls.autoRotate = false;
        clearTimeout(this.idleTimeout);
        this.idleTimeout = setTimeout(() => {
            if(this.controls) this.controls.autoRotate = true;
        }, CONFIG.controls.idleTimeBeforeRotate);
    }

    // --- 4. INTERAÇÃO (RAYCASTING E EVENTOS) ---

    onMouseMove(event) {
        // Normalização de Coordenadas (-1 a +1)
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    onClick() {
        if (this.hoveredObject) {
            this.selectPart(this.hoveredObject);
        }
    }

    selectPart(object) {
        this.selectedPartName = object.name;
        
        // Atualizar UI
        if(this.ui.partLabel) this.ui.partLabel.textContent = `Selecionado: ${this.selectedPartName}`;
        if(this.ui.colorPicker) {
            const hex = object.material.color.getHexString();
            this.ui.colorPicker.value = `#${hex}`;
        }

        // Feedback Visual (Flash)
        const originalEmissive = object.material.emissive.getHex();
        object.material.emissive.setHex(CONFIG.colors.clickFlash);
        
        setTimeout(() => {
            if (object) object.material.emissive.setHex(originalEmissive);
        }, 100);

        console.log(`Peça selecionada: ${this.selectedPartName}`);
    }

    checkIntersection() {
        if (!this.model) return;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        if (intersects.length > 0) {
            const object = intersects[0].object;

            if (this.hoveredObject !== object) {
                // Resetar anterior
                if (this.hoveredObject) {
                    this.hoveredObject.material.emissive.setHex(CONFIG.colors.defaultEmissive);
                }
                
                // Setar novo
                this.hoveredObject = object;
                this.hoveredObject.material.emissive.setHex(CONFIG.colors.selectionEmissive);
                this.container.style.cursor = 'pointer';
            }
        } else {
            if (this.hoveredObject) {
                this.hoveredObject.material.emissive.setHex(CONFIG.colors.defaultEmissive);
                this.hoveredObject = null;
                this.container.style.cursor = 'default';
            }
        }
    }

    // --- 5. LÓGICA DE CUSTOMIZAÇÃO (API PÚBLICA) ---

    // Método seguro para mudar cor
    setColor(hexColorOrString) {
        if (!this.selectedPartName || !this.model) {
            console.warn("Nenhuma peça selecionada.");
            return;
        }

        const part = this.model.getObjectByName(this.selectedPartName);
        if (part && part.isMesh) {
            part.material.color.set(hexColorOrString);
        }
    }

    // Método seguro para mudar acabamento
    setFinish(finishType) {
        if (!this.selectedPartName || !this.model) return;

        const part = this.model.getObjectByName(this.selectedPartName);
        if (!part || !part.isMesh) return;

        // Garante que é MeshPhysicalMaterial
        this.ensurePhysicalMaterial(part);

        const mat = part.material;

        // Configurações de Acabamento (Presets)
        const finishes = {
            'fosco': { metalness: 0.0, roughness: 0.7, clearcoat: 0.0, reflectivity: 0.1 },
            'metalico': { metalness: 0.7, roughness: 0.2, clearcoat: 0.5, reflectivity: 1.0 },
            'cromado': { metalness: 1.0, roughness: 0.0, clearcoat: 1.0, reflectivity: 1.0 },
            'verniz': { metalness: 0.0, roughness: 0.2, clearcoat: 1.0, reflectivity: 0.5 },
        };

        const preset = finishes[finishType];
        if (preset) {
            Object.assign(mat, preset);
            mat.needsUpdate = true;
        }
    }

    ensurePhysicalMaterial(mesh) {
        if (mesh.material.type !== 'MeshPhysicalMaterial') {
            const oldMat = mesh.material;
            const newMat = new THREE.MeshPhysicalMaterial().copy(oldMat);
            newMat.envMap = this.scene.environment; // Garante reflexo
            mesh.material = newMat;
        }
    }

    // --- 6. CORE LOOP ---

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.controls.update();
        
        // Só faz raycast se a intro acabou (economiza processamento)
        if (this.isIntroComplete) {
            this.checkIntersection();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

// --- INICIALIZAÇÃO E BINDING DE UI ---
// Isso ficaria idealmente em um arquivo main.js separado

const app = new CarConfigurator(document.body);

// Exemplo de como conectar os botões HTML à Classe
// Isso desacopla a lógica 3D da lógica de DOM

document.getElementById('html-color-picker').addEventListener('input', (e) => {
    app.setColor(e.target.value);
});

// Helper para botões de cor fixa
const bindColorButton = (id, hex) => {
    const btn = document.getElementById(id);
    if(btn) btn.addEventListener('click', () => app.setColor(hex));
};
bindColorButton('btn-red', 0xff0000);
bindColorButton('btn-blue', 0x0000ff);
bindColorButton('btn-white', 0xffffff);

// Helper para botões de acabamento
const bindFinishButton = (id, type) => {
    const btn = document.getElementById(id);
    if(btn) btn.addEventListener('click', () => app.setFinish(type));
};
bindFinishButton('btn-fosco', 'fosco');
bindFinishButton('btn-metalico', 'metalico');
bindFinishButton('btn-verniz', 'verniz');
bindFinishButton('btn-cromado', 'cromado'); // Adicionei para completar