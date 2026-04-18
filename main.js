import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

class AimTrainer {
    constructor() {
        this.canvas = document.querySelector('#game-canvas');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(71, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2(0, 0);

        this.sensitivity = 0.25;
        this.yaw = 0;
        this.pitch = 0;

        // 6-mode Valorant playlist
        this.playlist = [
            { id: 'gridshot',        name: 'GRIDSHOT',         size: 0.40, spawnRate: 600,  xRange: 14, yRange: 8,   color: 0x00d2ff, maxTargets: 3 },
            { id: 'flick_headshot',  name: 'FLICK HEADSHOT',   size: 0.14, spawnRate: 480,  xRange: 18, yRange: 0.1, color: 0x44ff44, maxTargets: 1 },
            { id: 'strafe',          name: 'STRAFE SHOT',      size: 0.22, spawnRate: 900,  xRange: 16, yRange: 3,   color: 0xff9900, maxTargets: 2, type: 'moving' },
            { id: 'tracking',        name: 'TRACKING',         size: 0.38, spawnRate: 4000, xRange: 12, yRange: 5,   color: 0xff4444, maxTargets: 1, type: 'tracking' },
            { id: 'reflex',          name: 'REFLEX SHOT',      size: 0.22, spawnRate: 350,  xRange: 12, yRange: 6,   color: 0x6ede8a, maxTargets: 1, disappearMs: 750 },
            { id: 'precision_final', name: 'PRÉCISION FINALE', size: 0.09, spawnRate: 1200, xRange: 8,  yRange: 4,   color: 0xff0000, maxTargets: 1 }
        ];
        this.currentTaskIndex = 0;
        this.taskDuration = 60;

        this.VALO_DEG_PER_COUNT = 0.07;

        // Game State
        this.isActive = false;
        this.isLocked = false;
        this.score = 0;
        this.clicks = 0;
        this.hits = 0;
        this.misses = 0;
        this.streak = 0;
        this.maxStreak = 0;
        this.targets = [];
        this.startTime = 0;
        this.pausedTime = 0;
        this.totalPausedDuration = 0;
        this.sessionDuration = 600;
        this.spawnDelay = 800;
        this.lastSpawnTime = 0;
        this.reactionTimes = [];
        this.spawnedTargetsAt = new Map();
        this.isPaused = false;
        this.modeStats = {};

        // Tracking mode
        this.lastTrackingCheck = 0;

        // Real-time tips rotation
        this.tips = [
            "Counter-strafe avant de tirer : arrêtez de bouger pour une précision maximale.",
            "Pré-visez les angles — gardez votre crosshair à hauteur de tête en permanence.",
            "Analysez vos misses : trop à gauche ? Trop à droite ? Ajustez votre grip.",
            "Anticipez la trajectoire des ennemis qui strafent. Ne réagissez pas, prédisez.",
            "En Valorant, le Sheriff = 1-shot headshot. Chaque flick doit viser la tête.",
            "Micro-ajustements : utilisez votre avant-bras, pas votre poignet seul.",
            "Relâchez vos épaules — la tension musculaire dégrade votre précision.",
            "Le flick commence depuis le centre : repositionnez entre chaque tir.",
            "Wide peek : sortez vite d'un angle pour voir l'ennemi avant qu'il vous voit.",
            "En VALORANT, le spray commence à la 4e balle — switchez sur tap-fire après.",
        ];
        this.currentTipIndex = 0;
        this.lastTipTime = 0;

        // Movement
        this.moveSpeed = 7.5;
        this.clock = new THREE.Clock();
        this.velocityY = 0;
        this.isJumping = false;
        this.isMoving = false;
        this.keys = { w: false, a: false, s: false, d: false, z: false, q: false, ' ': false };

        // UI elements
        this.ui = {
            menu: document.getElementById('menu'),
            hud: document.getElementById('hud'),
            results: document.getElementById('results'),
            scoreLabel: document.getElementById('score'),
            timerLabel: document.getElementById('timer'),
            accuracyLabel: document.getElementById('accuracy'),
            streakLabel: document.getElementById('streak'),
            tipBar: document.getElementById('tip-bar'),
            resScore: document.getElementById('res-score'),
            resAccuracy: document.getElementById('res-accuracy'),
            resReaction: document.getElementById('res-reaction'),
            resGrade: document.getElementById('res-grade'),
            resModeStats: document.getElementById('res-mode-stats'),
            analysisText: document.getElementById('analysis-text'),
            tipText: document.getElementById('tip-text'),
            startBtn: document.getElementById('start-btn'),
            retryBtn: document.getElementById('retry-btn'),
            quitBtn: document.getElementById('quit-btn'),
            fullscreenBtn: document.getElementById('fullscreen-btn'),
            sensitivityInput: document.getElementById('sensitivity'),
            sensitivityNum: document.getElementById('sensitivity-num'),
            crosshairCodeInput: document.getElementById('crosshair-code'),
            taskName: document.getElementById('current-task'),
            nextTaskTimer: document.getElementById('next-task-timer')
        };

        this.history = JSON.parse(localStorage.getItem('strac_aim_history') || '[]');

        this.audioCtx = null;
        this.initAudio();
        this.init();
    }

    initAudio() {
        const handleInteraction = () => {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            this.playNotificationSound('test');
        };
        document.addEventListener('mousedown', handleInteraction);
        document.addEventListener('keydown', handleInteraction);
        this.ui.startBtn.addEventListener('click', handleInteraction);
    }

    playNotificationSound(type, exerciseId) {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        const now = this.audioCtx.currentTime;

        if (type === 'test') {
            osc.frequency.setValueAtTime(10, now);
            gain.gain.setValueAtTime(0.001, now);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'task-switch') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'session-end') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
            osc.frequency.linearRampToValueAtTime(1800, now + 0.4);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.3, now + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
            osc.start(now); osc.stop(now + 0.6);
        } else if (type === 'streak') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.linearRampToValueAtTime(1600, now + 0.1);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'miss') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now); osc.stop(now + 0.08);
        } else if (type === 'target-hit') {
            let freq = 1000, decay = 0.1, waveType = 'sine';
            switch (exerciseId) {
                case 'gridshot':       freq = 1000; break;
                case 'tracking':       freq = 400; decay = 0.05; waveType = 'triangle'; break;
                case 'flick_headshot': freq = 1800; break;
                case 'strafe':         freq = 1100; break;
                case 'reflex':         freq = 2000; break;
                case 'precision_final':freq = 2200; break;
                default:               freq = 1000;
            }
            osc.type = waveType;
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq / 2, now + decay);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + decay);
            osc.start(now); osc.stop(now + decay);
        }
    }

    init() {
        this.setupRenderer();
        this.setupLights();
        this.setupEnvironment();
        this.setupWeapon();
        this.addEventListeners();
        this.animate();
    }

    setupRenderer() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.camera.position.set(0, 5, 10);
    }

    setupLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const p1 = new THREE.PointLight(0x00f2ff, 150);
        p1.position.set(5, 5, 5);
        this.scene.add(p1);
        const p2 = new THREE.PointLight(0xff00ff, 100);
        p2.position.set(-5, 2, -2);
        this.scene.add(p2);
    }

    setupEnvironment() {
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100),
            new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, metalness: 0.2 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -3;
        this.scene.add(floor);

        const gridHelper = new THREE.GridHelper(100, 50, 0x333333, 0x222222);
        gridHelper.position.y = -2.99;
        this.scene.add(gridHelper);

        const wallGrid = new THREE.GridHelper(20, 20, 0x222222, 0x111111);
        wallGrid.rotation.x = Math.PI / 2;
        wallGrid.position.z = -10;
        this.scene.add(wallGrid);

        this.scene.background = new THREE.Color(0x050505);
    }

    setupWeapon() {
        this.weaponGroup = new THREE.Group();

        // Strong key light from top-front to make the gun pop
        const viewLight = new THREE.PointLight(0xffffff, 3.5, 3);
        viewLight.position.set(0.2, 0.4, 0.3);
        this.camera.add(viewLight);

        // Warm fill light from below-right (mimics Valorant outdoor lighting)
        const fillLight = new THREE.PointLight(0xfff4e0, 1.2, 3);
        fillLight.position.set(0.4, -0.3, 0.4);
        this.camera.add(fillLight);

        const loader = new GLTFLoader();
        loader.load('./assets/pistol/source/Arcane Sheriff.glb', (gltf) => {
            const pistol = gltf.scene;
            const box = new THREE.Box3().setFromObject(pistol);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());

            // Scale: slightly bigger than original (0.3) but not huge
            const targetScale = 0.42 / Math.max(size.x, size.y, size.z, 1);
            pistol.scale.setScalar(targetScale);
            pistol.position.set(-center.x * targetScale, -center.y * targetScale, -center.z * targetScale);

            const wrapper = new THREE.Group();
            wrapper.add(pistol);
            // Barrel originally on +X axis.
            // Ry(3π/4): barrel goes to (-X,-Z)/√2 → we see the RIGHT SIDE of the gun.
            // Rx(-0.10): barrel tips slightly upward (natural hold angle).
            // Rz(0.06): slight roll so grip falls naturally toward the hand.
            wrapper.rotation.set(-0.10, 3 * Math.PI / 4, 0.06);
            this.weaponGroup.add(wrapper);
        });

        const skinMat   = new THREE.MeshStandardMaterial({ color: 0x7a4219, roughness: 0.65 });
        const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.85 });

        // Right forearm — comes from bottom-right
        const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.55, 16), sleeveMat);
        armR.position.set(0.08, -0.32, 0.14);
        armR.rotation.set(-Math.PI / 2.8, 0, -0.22);

        // Right hand gripping the handle
        const handR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.10), skinMat);
        handR.position.set(0.04, -0.19, 0.04);
        handR.rotation.set(0.1, 0, -0.08);

        // Thumb
        const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.06), skinMat);
        thumb.position.set(-0.04, -0.16, 0.02);
        thumb.rotation.set(0.1, -0.3, 0.22);

        // Left forearm — support
        const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.50, 16), sleeveMat);
        armL.position.set(-0.10, -0.35, 0.14);
        armL.rotation.set(-Math.PI / 2.8, 0, 0.30);

        // Left hand — under the barrel
        const handL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.10, 0.10), skinMat);
        handL.position.set(-0.08, -0.23, 0.03);
        handL.rotation.set(0.1, 0.1, 0.12);

        // Yellow wrist band
        const bandMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.45, metalness: 0.4 });
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.012, 8, 24), bandMat);
        band.position.set(0.08, -0.28, 0.18);
        band.rotation.set(-Math.PI / 2.8, 0, -0.22);

        this.weaponGroup.add(armR, handR, thumb, armL, handL, band);

        // Position matches the original that was visually correct (y=-0.18, z=-0.40)
        // Slightly adjusted: more right (+x), same depth
        this.weaponGroup.position.set(0.14, -0.18, -0.40);
        // Angle group inward so barrel points roughly toward crosshair
        this.weaponGroup.rotation.set(0, -0.12, 0.03);

        this.camera.add(this.weaponGroup);
        this.scene.add(this.camera);
    }

    addEventListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        document.addEventListener('pointerlockchange', () => {
            this.isLocked = document.pointerLockElement === this.canvas;
            if (!this.isLocked && this.isActive && !this.isPaused) this.pauseGame();
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isLocked || !this.isActive || this.isPaused) return;
            const BROWSER_COMPENSATION = 1.08;
            const scale = (window.devicePixelRatio || 1) * BROWSER_COMPENSATION;
            const moveX = (e.movementX || 0) * scale;
            const moveY = (e.movementY || 0) * scale;
            const degToRad = Math.PI / 180;
            this.yaw -= (moveX * this.sensitivity * this.VALO_DEG_PER_COUNT) * degToRad;
            this.pitch -= (moveY * this.sensitivity * this.VALO_DEG_PER_COUNT) * degToRad;
            this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.pitch));
            this.camera.rotation.order = 'YXZ';
            this.camera.rotation.set(this.pitch, this.yaw, 0);
        });

        window.addEventListener('mousedown', (e) => {
            if (!this.isActive || this.isPaused) return;
            if (!this.isLocked) { this.canvas.requestPointerLock(); return; }
            if (e.button === 0) this.handleShoot();
        });

        this.ui.crosshairCodeInput.addEventListener('input', (e) => this.parseCrosshairCode(e.target.value));

        this.ui.sensitivityInput.addEventListener('input', (e) => {
            this.sensitivity = parseFloat(e.target.value);
            this.ui.sensitivityNum.value = this.sensitivity.toFixed(3);
        });
        this.ui.sensitivityNum.addEventListener('input', (e) => {
            this.sensitivity = parseFloat(e.target.value) || 0;
            this.ui.sensitivityInput.value = this.sensitivity;
        });

        this.ui.startBtn.addEventListener('click', () => {
            if (this.isPaused) this.resumeGame();
            else this.startGame();
        });
        this.ui.retryBtn.addEventListener('click', () => this.startGame());
        this.ui.quitBtn.addEventListener('click', () => this.quitSession());
        this.ui.fullscreenBtn.addEventListener('click', () => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen();
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'F11') {
                e.preventDefault();
                if (document.fullscreenElement) document.exitFullscreen();
                else document.documentElement.requestFullscreen();
                return;
            }
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) this.keys[key] = true;
        });
        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) this.keys[key] = false;
        });

        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.sessionDuration = parseInt(btn.dataset.time);
                this.taskDuration = this.sessionDuration / this.playlist.length;
            });
        });
    }

    pauseGame() {
        this.isPaused = true;
        this.pausedTime = performance.now();
        this.ui.menu.classList.remove('hidden');
        this.ui.startBtn.textContent = "REPRENDRE LA SESSION";
        this.ui.quitBtn.classList.remove('hidden');
    }

    resumeGame() {
        const pauseDuration = performance.now() - this.pausedTime;
        this.totalPausedDuration += pauseDuration;
        this.lastSpawnTime += pauseDuration;
        for (let [uuid, time] of this.spawnedTargetsAt) {
            this.spawnedTargetsAt.set(uuid, time + pauseDuration);
        }
        this.isPaused = false;
        this.ui.menu.classList.add('hidden');
        this.ui.quitBtn.classList.add('hidden');
        this.canvas.requestPointerLock();
    }

    quitSession() {
        this.isActive = false;
        this.isPaused = false;
        this.targets.forEach(t => this.scene.remove(t));
        this.targets = [];
        this.spawnedTargetsAt.clear();
        this.ui.menu.classList.remove('hidden');
        this.ui.hud.classList.add('hidden');
        this.ui.results.classList.add('hidden');
        this.ui.quitBtn.classList.add('hidden');
        this.ui.startBtn.textContent = "DÉMARRER LA SESSION";
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }

    startGame() {
        this.score = 0;
        this.clicks = 0;
        this.hits = 0;
        this.misses = 0;
        this.streak = 0;
        this.maxStreak = 0;
        this.reactionTimes = [];
        this.currentTaskIndex = 0;
        this.modeStats = {};
        this.playlist.forEach(t => {
            this.modeStats[t.id] = { hits: 0, clicks: 0, reactionTimes: [] };
        });
        this.lastTrackingCheck = performance.now();
        this.updateCurrentTask();
        this.startTime = performance.now();
        this.totalPausedDuration = 0;
        this.lastSpawnTime = 0;
        this.lastTipTime = performance.now();
        this.currentTipIndex = 0;
        this.isActive = true;
        this.isPaused = false;
        this.ui.startBtn.textContent = "DÉMARRER LA SESSION";
        this.ui.quitBtn.classList.add('hidden');
        this.yaw = 0;
        this.pitch = 0;
        this.camera.rotation.set(0, 0, 0);
        this.camera.position.set(0, 5, 10);

        this.taskDuration = this.sessionDuration / this.playlist.length;

        if (this.canvas.requestPointerLock) {
            this.canvas.requestPointerLock({ unadjustedMovement: true }).catch(() => this.canvas.requestPointerLock());
        }

        this.targets.forEach(t => this.scene.remove(t));
        this.targets = [];
        this.spawnedTargetsAt.clear();

        this.ui.menu.classList.add('hidden');
        this.ui.results.classList.add('hidden');
        this.ui.hud.classList.remove('hidden');

        if (this.ui.tipBar) this.ui.tipBar.textContent = this.tips[0];
        this.updateHUD();

        const root = document.documentElement;
        if (root.requestFullscreen) root.requestFullscreen();
        else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    }

    updateCurrentTask() {
        const task = this.playlist[this.currentTaskIndex];
        this.currentMode = task.id;
        this.spawnDelay = task.spawnRate;
        this.ui.taskName.textContent = task.name;
        this.playNotificationSound('task-switch');
        this.targets.forEach(t => this.scene.remove(t));
        this.targets = [];
        this.spawnedTargetsAt.clear();
    }

    parseCrosshairCode(code) {
        if (!code || !code.trim()) return;
        try {
            const parts = code.trim().split(';');

            // Isolate the P (primary) section only — skip S (ADS) section
            const pIdx = parts.indexOf('P');
            const sIdx = parts.indexOf('S');
            let pParts;
            if (pIdx !== -1) {
                const end = (sIdx !== -1 && sIdx > pIdx) ? sIdx : parts.length;
                pParts = parts.slice(pIdx + 1, end);
            } else {
                pParts = parts.filter(p => p !== '0');
            }

            const params = {};
            for (let i = 0; i < pParts.length; i++) {
                const key = pParts[i];
                const next = pParts[i + 1];
                if (isNaN(key) && next !== undefined && !isNaN(next)) {
                    params[key] = parseFloat(next);
                    i++;
                }
            }

            const root = document.documentElement;
            const SCALE = 2; // Valorant units → CSS pixels

            // Color mapping — Valorant c values
            const colorMap = {
                0: '#ffffff', 1: '#00ff00', 2: '#ffff00',
                3: '#4169ff', 4: '#ff4655', 5: '#00ffff',
                6: '#ff69b4', 7: '#ffffff', 8: '#ffffff',
            };
            if (params['c'] !== undefined) {
                root.style.setProperty('--accent-color', colorMap[Math.floor(params['c'])] || '#00d2ff');
            }

            const thickness = (params['0t'] ?? 1) * SCALE;
            const length    = (params['0l'] ?? 3) * SCALE;
            const offset    = (params['0o'] ?? 1) * SCALE;
            root.style.setProperty('--ch-thickness', `${Math.max(1, thickness)}px`);
            root.style.setProperty('--ch-length',    `${Math.max(2, length)}px`);
            root.style.setProperty('--ch-offset',    `${Math.max(0, offset)}px`);

            // Opacity on lines
            const opacity = params['0a'] !== undefined ? params['0a'] : 1;
            document.querySelectorAll('.ch-line').forEach(l => {
                l.style.opacity = opacity;
                l.style.display = 'block'; // inner lines always visible
            });

            // Center dot — 0s = 1 means show dot
            const dot = document.getElementById('ch-dot');
            if (dot) {
                dot.classList.toggle('active', params['0s'] === 1);
                const dotSize = (params['0pd'] ?? 2) * SCALE;
                root.style.setProperty('--ch-dot-size', `${Math.max(1, dotSize)}px`);
                dot.style.opacity = opacity;
            }
        } catch (e) { console.error("Erreur parsing crosshair:", e); }
    }

    playKillSound() {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const now = this.audioCtx.currentTime;

        // Pick a random skin kill sound each time
        const skin = ['recon', 'phaseguard', 'glitchpop', 'neo_frontier'][Math.floor(Math.random() * 4)];

        const connect = (nodes) => {
            for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
            nodes[nodes.length - 1].connect(this.audioCtx.destination);
        };

        if (skin === 'recon') {
            // Military tactical: sharp metallic click + high-pitched ping
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            connect([osc, gain]);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(2600, now);
            osc.frequency.exponentialRampToValueAtTime(1300, now + 0.09);
            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
            osc.start(now); osc.stop(now + 0.13);

            const click = this.audioCtx.createOscillator();
            const cGain = this.audioCtx.createGain();
            connect([click, cGain]);
            click.type = 'square';
            click.frequency.setValueAtTime(220, now);
            cGain.gain.setValueAtTime(0.12, now);
            cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
            click.start(now); click.stop(now + 0.025);

        } else if (skin === 'phaseguard') {
            // Energy shield: rising swoosh then dissolve
            const osc = this.audioCtx.createOscillator();
            const filter = this.audioCtx.createBiquadFilter();
            const gain = this.audioCtx.createGain();
            connect([osc, filter, gain]);
            osc.type = 'sawtooth';
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1400, now);
            filter.Q.setValueAtTime(4, now);
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.linearRampToValueAtTime(720, now + 0.07);
            osc.frequency.exponentialRampToValueAtTime(180, now + 0.22);
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc.start(now); osc.stop(now + 0.22);

        } else if (skin === 'glitchpop') {
            // Glitchy digital: 3 rapid electronic bursts at random pitches
            for (let i = 0; i < 3; i++) {
                const o = this.audioCtx.createOscillator();
                const g = this.audioCtx.createGain();
                const dist = this.audioCtx.createWaveShaper();
                const curve = new Float32Array(256);
                for (let j = 0; j < 256; j++) {
                    const x = (j * 2) / 256 - 1;
                    curve[j] = (Math.PI + 80) * x / (Math.PI + 80 * Math.abs(x));
                }
                dist.curve = curve;
                connect([o, dist, g]);
                const t = now + i * 0.038;
                o.type = 'square';
                o.frequency.setValueAtTime(300 + Math.random() * 1000, t);
                o.frequency.setValueAtTime(200 + Math.random() * 600, t + 0.015);
                g.gain.setValueAtTime(0.14, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.034);
                o.start(t); o.stop(t + 0.034);
            }

        } else if (skin === 'neo_frontier') {
            // Space-western: laser ricochet descending whistle
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            const reverb = this.audioCtx.createDelay(0.3);
            const revGain = this.audioCtx.createGain();
            connect([osc, gain]);
            osc.connect(reverb);
            reverb.connect(revGain);
            revGain.connect(this.audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(3200, now);
            osc.frequency.exponentialRampToValueAtTime(320, now + 0.28);
            gain.gain.setValueAtTime(0.26, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            reverb.delayTime.setValueAtTime(0.12, now);
            revGain.gain.setValueAtTime(0.12, now);
            revGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.start(now); osc.stop(now + 0.4);
        }
    }

    getGrade(accuracy, avgReaction, score) {
        const accScore = Math.min(accuracy / 100, 1) * 50;
        const reacScore = avgReaction <= 0 ? 15 :
            avgReaction < 150 ? 30 :
            avgReaction < 200 ? 25 :
            avgReaction < 250 ? 20 :
            avgReaction < 300 ? 15 :
            avgReaction < 400 ? 10 : 5;
        const scoreNorm = Math.min(score / 5000, 1) * 20;
        const total = accScore + reacScore + scoreNorm;
        if (total >= 90) return { grade: 'S',  color: '#FFD700' };
        if (total >= 80) return { grade: 'A+', color: '#00d2ff' };
        if (total >= 70) return { grade: 'A',  color: '#00d2ff' };
        if (total >= 60) return { grade: 'B',  color: '#44ff44' };
        if (total >= 50) return { grade: 'C',  color: '#ff9900' };
        return              { grade: 'D',  color: '#ff4444' };
    }

    endGame() {
        this.isActive = false;

        const accuracy = this.clicks > 0 ? Math.round((this.hits / this.clicks) * 100) : 0;
        const avgReaction = this.reactionTimes.length > 0
            ? Math.round(this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length) : 0;

        const currentResult = {
            score: this.score, accuracy, reaction: avgReaction,
            maxStreak: this.maxStreak, date: Date.now()
        };

        this.analyzeStats(currentResult);

        this.history.push(currentResult);
        if (this.history.length > 50) this.history.shift();
        localStorage.setItem('strac_aim_history', JSON.stringify(this.history));

        this.ui.resScore.textContent = this.score;
        this.ui.resAccuracy.textContent = `${accuracy}%`;
        this.ui.resReaction.textContent = `${avgReaction}ms`;

        const g = this.getGrade(accuracy, avgReaction, this.score);
        if (this.ui.resGrade) {
            this.ui.resGrade.textContent = g.grade;
            this.ui.resGrade.style.color = g.color;
            this.ui.resGrade.style.textShadow = `0 0 30px ${g.color}`;
        }

        // Per-mode stats breakdown
        if (this.ui.resModeStats) {
            let html = '';
            this.playlist.forEach(task => {
                const s = this.modeStats[task.id];
                if (!s) return;
                const modeAcc = s.clicks > 0 ? Math.round((s.hits / s.clicks) * 100) : '—';
                const modeReac = s.reactionTimes.length > 0
                    ? Math.round(s.reactionTimes.reduce((a, b) => a + b, 0) / s.reactionTimes.length)
                    : '—';
                const accColor = typeof modeAcc === 'number'
                    ? (modeAcc >= 85 ? '#44ff44' : modeAcc >= 70 ? '#ff9900' : '#ff4444')
                    : '#a0a0a0';
                html += `<div class="mode-stat-row">
                    <span class="mode-stat-name">${task.name}</span>
                    <span class="mode-stat-val">${s.hits} hits</span>
                    <span class="mode-stat-val" style="color:${accColor}">${modeAcc}${typeof modeAcc === 'number' ? '%' : ''}</span>
                    <span class="mode-stat-val">${modeReac}${typeof modeReac === 'number' ? 'ms' : ''}</span>
                </div>`;
            });
            if (this.maxStreak > 0) {
                html += `<div class="mode-stat-row streak-row">
                    <span class="mode-stat-name">MEILLEUR STREAK</span>
                    <span class="mode-stat-val" style="color:#FFD700">${this.maxStreak}x</span>
                </div>`;
            }
            this.ui.resModeStats.innerHTML = html;
        }

        this.playNotificationSound('session-end');
        this.ui.hud.classList.add('hidden');
        this.ui.results.classList.remove('hidden');
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }

    analyzeStats(current) {
        if (this.history.length === 0) {
            this.ui.analysisText.textContent = "Première session ! Établissez votre base avant de comparer.";
        } else {
            const last = this.history[this.history.length - 1];
            const scoreDiff = current.score - last.score;
            const accDiff = current.accuracy - last.accuracy;
            let analysis = scoreDiff >= 0
                ? `+${scoreDiff} pts vs session précédente. `
                : `${scoreDiff} pts vs session précédente. `;
            analysis += accDiff > 0
                ? `Précision en hausse (+${accDiff}%). `
                : accDiff < 0 ? `Précision en baisse (${accDiff}%). ` : `Précision stable. `;
            if (current.maxStreak > (last.maxStreak || 0)) {
                analysis += `Nouveau record de streak : ${current.maxStreak}x ! `;
            }
            this.ui.analysisText.textContent = analysis;
        }

        // Valorant-specific tips
        const tips = {
            lowAccuracy: [
                "Précision < 80% : counter-strafe avant chaque tir. Bouger = bullet spread en Valorant.",
                "Visez la tête en priority. Sheriff = 1-shot headshot — exploitez-le.",
                "Réduisez votre sensibilité de 10% et retestez. Plus de contrôle = plus de précision.",
            ],
            slowReaction: [
                "Réaction lente : pré-visez les angles où les ennemis apparaissent. Ne réagissez pas, attendez.",
                "Wide peek : sortez vite d'un angle pour voir l'ennemi avant qu'il vous voit.",
                "Gardez votre crosshair à hauteur de tête pour minimiser le temps d'ajustement.",
            ],
            good: [
                "Excellent ! Transférez ces skills en deathmatch Valorant pour les tester sous pression.",
                "Continuez. La consistency sur plusieurs sessions = le vrai indicateur de progression.",
                "Travaillez maintenant la précision sous pression : solo ranked est votre prochaine salle de gym.",
            ]
        };

        let pool;
        if (current.accuracy < 80) pool = tips.lowAccuracy;
        else if (current.reaction > 280) pool = tips.slowReaction;
        else pool = tips.good;

        this.ui.tipText.textContent = pool[Math.floor(Math.random() * pool.length)];
    }

    spawnTarget() {
        const task = this.playlist[this.currentTaskIndex];
        const maxTargets = task.maxTargets || 5;
        if (this.targets.length >= maxTargets) return;

        const material = new THREE.MeshStandardMaterial({
            color: task.color,
            emissive: task.color,
            emissiveIntensity: 0.5,
            metalness: 0.8,
            roughness: 0.2
        });

        let target;
        if (task.type === 'moving' || task.type === 'tracking') {
            target = new THREE.Mesh(new THREE.CapsuleGeometry(task.size, task.size * 2, 8, 16), material);
        } else {
            target = new THREE.Mesh(new THREE.SphereGeometry(task.size, 32, 32), material);
        }

        const baseY = task.yRange > 1
            ? 4.0 + (Math.random() - 0.5) * task.yRange
            : 5.0 + (Math.random() * 0.2 - 0.1);

        target.position.set((Math.random() - 0.5) * task.xRange, baseY, -5);

        if (task.type === 'moving') {
            const dir = Math.random() < 0.5 ? -1 : 1;
            const speed = 3.0 + Math.random() * 4.0;
            target.velocity = new THREE.Vector3(dir * speed, 0, 0);
            target.isMovingTarget = true;
        }

        if (task.type === 'tracking') {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2.5 + Math.random() * 2.0;
            target.velocity = new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed * 0.5, 0);
            target.isMovingTarget = true;
            target.isTracking = true;
        }

        if (task.disappearMs) {
            target.disappearAt = performance.now() + task.disappearMs;
            // White ring for reflex targets
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(task.size * 1.25, task.size * 1.5, 32),
                new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
            );
            ring.lookAt(new THREE.Vector3(0, 0, 10));
            target.add(ring);
        }

        this.scene.add(target);
        this.targets.push(target);
        this.spawnedTargetsAt.set(target.uuid, performance.now());
    }

    handleShoot() {
        this.clicks++;
        const task = this.playlist[this.currentTaskIndex];
        if (this.modeStats[task.id]) this.modeStats[task.id].clicks++;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.targets, true);

        let hitTarget = null;
        if (intersects.length > 0) {
            let obj = intersects[0].object;
            // Traverse up to find the root target mesh
            while (obj && !this.targets.includes(obj)) obj = obj.parent;
            if (obj && this.targets.includes(obj)) hitTarget = obj;
        }

        if (hitTarget) {
            this.handleHit(hitTarget);
        } else {
            this.misses++;
            this.streak = 0;
            if (this.ui.streakLabel) this.ui.streakLabel.textContent = '';
            this.playNotificationSound('miss');
        }
        this.updateHUD();

        // Weapon kickback
        if (this.weaponGroup) {
            this.weaponGroup.position.z += 0.05;
            this.weaponGroup.rotation.x -= 0.1;
            setTimeout(() => {
                this.weaponGroup.position.z -= 0.05;
                this.weaponGroup.rotation.x += 0.1;
            }, 50);
        }
    }

    handleHit(target) {
        this.hits++;
        this.streak++;
        if (this.streak > this.maxStreak) this.maxStreak = this.streak;

        const task = this.playlist[this.currentTaskIndex];
        if (this.modeStats[task.id]) this.modeStats[task.id].hits++;

        const spawnTime = this.spawnedTargetsAt.get(target.uuid);
        const reaction = performance.now() - (spawnTime || performance.now());
        this.reactionTimes.push(reaction);
        if (this.modeStats[task.id]) this.modeStats[task.id].reactionTimes.push(reaction);

        // Scoring: base + speed bonus (max +50 for <500ms) + streak multiplier
        let points = 100;
        if (reaction < 500) points += Math.round((500 - reaction) / 10);
        const multiplier = this.streak >= 10 ? 2.0 : this.streak >= 5 ? 1.5 : 1.0;
        points = Math.round(points * multiplier);
        this.score += points;

        if (this.streak === 5 || this.streak === 10 || (this.streak > 10 && this.streak % 5 === 0)) {
            this.playNotificationSound('streak');
        }
        this.playKillSound();

        // Flash then remove
        if (target.material) target.material.emissiveIntensity = 2.5;
        setTimeout(() => {
            this.scene.remove(target);
            this.targets = this.targets.filter(t => t !== target);
            this.spawnedTargetsAt.delete(target.uuid);
            this.spawnTarget();
            this.updateHUD();
        }, 50);
    }

    updateHUD() {
        this.ui.scoreLabel.textContent = this.score.toString().padStart(3, '0');
        const accuracy = this.clicks > 0 ? Math.round((this.hits / this.clicks) * 100) : 100;
        this.ui.accuracyLabel.textContent = `${accuracy}%`;
        if (this.ui.streakLabel) {
            this.ui.streakLabel.textContent = this.streak >= 3 ? `${this.streak}x` : '';
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = Math.min(this.clock.getDelta(), 0.05); // cap delta to avoid big jumps

        if (this.isActive && !this.isPaused) {
            this.handleMovement(delta);
            const now = performance.now();
            const totalElapsed = (now - this.startTime - this.totalPausedDuration) / 1000;
            const remainingTotal = Math.max(0, this.sessionDuration - totalElapsed);

            const mins = Math.floor(remainingTotal / 60);
            const secs = Math.floor(remainingTotal % 60);
            this.ui.timerLabel.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

            const currentTaskElapsed = totalElapsed % this.taskDuration;
            const nextTaskRemaining = Math.ceil(this.taskDuration - currentTaskElapsed);
            this.ui.nextTaskTimer.textContent = `NEXT: ${nextTaskRemaining}s`;

            const newTaskIndex = Math.min(Math.floor(totalElapsed / this.taskDuration), this.playlist.length - 1);
            if (newTaskIndex !== this.currentTaskIndex) {
                this.currentTaskIndex = newTaskIndex;
                this.updateCurrentTask();
            }

            if (remainingTotal <= 0) { this.endGame(); return; }

            // Spawn
            const task = this.playlist[this.currentTaskIndex];
            if (now - this.lastSpawnTime > this.spawnDelay) {
                this.spawnTarget();
                this.lastSpawnTime = now;
            }

            // Tracking mode: accumulate points while crosshair is on target
            if (task.type === 'tracking' && this.targets.length > 0) {
                const timeDelta = (now - this.lastTrackingCheck) / 1000;
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const hits = this.raycaster.intersectObjects(this.targets, true);
                if (hits.length > 0) {
                    const pts = Math.round(15 * timeDelta);
                    if (pts > 0) {
                        this.score += pts;
                        this.updateHUD();
                    }
                }
            }
            this.lastTrackingCheck = now;

            // Target update
            const toRemove = [];
            this.targets.forEach(t => {
                // Reflex auto-disappear
                if (t.disappearAt && now > t.disappearAt) {
                    toRemove.push(t);
                    this.misses++;
                    this.streak = 0;
                    if (this.ui.streakLabel) this.ui.streakLabel.textContent = '';
                    return;
                }

                if (t.isMovingTarget) {
                    t.position.x += t.velocity.x * delta;
                    if (t.isTracking) {
                        t.position.y += t.velocity.y * delta;
                        if (t.position.y > 8 || t.position.y < 2) t.velocity.y *= -1;
                    }
                    if (Math.abs(t.position.x) > task.xRange / 2) {
                        t.velocity.x *= -1;
                        t.position.x = Math.sign(t.position.x) * task.xRange / 2;
                    }
                }

                // Pulse
                const pulse = 1 + Math.sin(now * 0.005) * 0.04;
                t.scale.set(pulse, pulse, pulse);
            });

            toRemove.forEach(t => {
                this.scene.remove(t);
                this.targets = this.targets.filter(x => x !== t);
                this.spawnedTargetsAt.delete(t.uuid);
                this.updateHUD();
            });

            // Rotate real-time tips every 25 seconds
            if (now - this.lastTipTime > 25000) {
                this.currentTipIndex = (this.currentTipIndex + 1) % this.tips.length;
                if (this.ui.tipBar) this.ui.tipBar.textContent = this.tips[this.currentTipIndex];
                this.lastTipTime = now;
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    handleMovement(delta) {
        const direction = new THREE.Vector3();
        const front = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        front.y = 0; right.y = 0;
        front.normalize(); right.normalize();

        if (this.keys.w || this.keys.z) direction.add(front);
        if (this.keys.s) direction.sub(front);
        if (this.keys.a || this.keys.q) direction.sub(right);
        if (this.keys.d) direction.add(right);

        this.isMoving = direction.length() > 0;
        if (this.isMoving) {
            direction.normalize().multiplyScalar(this.moveSpeed * delta);
            this.camera.position.add(direction);
        }

        const eyeHeight = 5;
        this.velocityY -= 15.0 * delta;
        this.camera.position.y += this.velocityY * delta;
        if (this.camera.position.y <= eyeHeight) {
            this.camera.position.y = eyeHeight;
            this.velocityY = 0;
            this.isJumping = false;
        }
        if (this.keys[' '] && !this.isJumping) {
            this.velocityY = 6.0;
            this.isJumping = true;
        }

        this.camera.position.x = Math.max(-10, Math.min(10, this.camera.position.x));
        this.camera.position.z = Math.max(-5, Math.min(15, this.camera.position.z));
    }
}

new AimTrainer();
