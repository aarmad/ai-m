import * as THREE from 'three';

class AimTrainer {
    constructor() {
        this.canvas = document.querySelector('#game-canvas');
        this.scene = new THREE.Scene();
        // 71 degrees vertical FOV = 103 degrees horizontal FOV in 16:9 (Valorant standard)
        this.camera = new THREE.PerspectiveCamera(71, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2(0, 0); // Always center for crosshair-based aiming

        this.sensitivity = 0.25; // New default sensitivity
        this.yaw = 0;
        this.pitch = 0;
        // Playlist Strac-aiM
        this.playlist = [
            { id: 'gridshot', name: 'GRIDSHOT', size: 0.45, spawnRate: 600, xRange: 14, yRange: 8, color: 0x00d2ff },
            { id: 'tracking', name: 'SMOOTH TRACKING', size: 0.35, spawnRate: 0, xRange: 16, yRange: 6, color: 0xffaa00, type: 'tracking' },
            { id: 'microshot', name: 'MICROSHOT', size: 0.18, spawnRate: 800, xRange: 5, yRange: 3, color: 0xff00ff },
            { id: 'sixshot', name: 'SIXSHOT', size: 0.12, spawnRate: 900, xRange: 12, yRange: 7, color: 0x00ff88 },
            { id: 'headshot', name: 'HEADSHOT', size: 0.18, spawnRate: 700, xRange: 15, yRange: 0.1, color: 0xffffff },
            { id: 'spidershot', name: 'SPIDERSHOT', size: 0.35, spawnRate: 750, xRange: 16, yRange: 9, color: 0xffaa00 },
            { id: 'reflex', name: 'REFLEX SHOT', size: 0.3, spawnRate: 350, xRange: 10, yRange: 5, color: 0x6ede8a },
            { id: 'wallshot', name: 'WIDE WALL', size: 0.4, spawnRate: 650, xRange: 20, yRange: 4, color: 0x8800ff },
            { id: 'precision_final', name: 'PRECISION FINAL', size: 0.1, spawnRate: 1000, xRange: 8, yRange: 4, color: 0xff0000 }
        ];
        this.currentTaskIndex = 0;
        this.taskDuration = 60; // seconds

        // Valorant constant: 1 count = 0.07 degrees
        this.VALO_DEG_PER_COUNT = 0.07;

        // Game State
        this.isActive = false;
        this.isLocked = false;
        this.score = 0;
        this.clicks = 0;
        this.hits = 0;
        this.targets = [];
        this.startTime = 0;
        this.pausedTime = 0;
        this.totalPausedDuration = 0;
        this.sessionDuration = 600; // default 10 minutes
        this.spawnDelay = 800;
        this.lastSpawnTime = 0;
        this.reactionTimes = [];
        this.spawnedTargetsAt = new Map(); // target.uuid -> timestamp
        this.isPaused = false;

        // Movement variables
        this.moveSpeed = 0.15;
        this.velocity = new THREE.Vector3();
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            z: false,
            q: false
        };

        // UI elements
        this.ui = {
            menu: document.getElementById('menu'),
            hud: document.getElementById('hud'),
            results: document.getElementById('results'),
            scoreLabel: document.getElementById('score'),
            timerLabel: document.getElementById('timer'),
            accuracyLabel: document.getElementById('accuracy'),
            resScore: document.getElementById('res-score'),
            resAccuracy: document.getElementById('res-accuracy'),
            resReaction: document.getElementById('res-reaction'),
            analysisText: document.getElementById('analysis-text'),
            tipText: document.getElementById('tip-text'),
            startBtn: document.getElementById('start-btn'),
            retryBtn: document.getElementById('retry-btn'),
            quitBtn: document.getElementById('quit-btn'),
            sensitivityInput: document.getElementById('sensitivity'),
            sensitivityNum: document.getElementById('sensitivity-num'),
            crosshairCodeInput: document.getElementById('crosshair-code'),
            taskName: document.getElementById('current-task'),
            nextTaskTimer: document.getElementById('next-task-timer')
        };

        this.history = JSON.parse(localStorage.getItem('strac_aim_history') || '[]');

        // Audio setup
        this.audioCtx = null;
        this.initAudio();
        this.init();
    }

    initAudio() {
        const handleInteraction = () => {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            // Test sound to confirm it's working (very quiet)
            this.playNotificationSound('test');
        };

        document.addEventListener('mousedown', handleInteraction);
        document.addEventListener('keydown', handleInteraction);
        this.ui.startBtn.addEventListener('click', handleInteraction);
    }

    playNotificationSound(type) {
        if (!this.audioCtx) return;

        // Ensure context is running
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const oscillator = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);

        const now = this.audioCtx.currentTime;

        if (type === 'test') {
            oscillator.frequency.setValueAtTime(10, now);
            gainNode.gain.setValueAtTime(0.001, now);
            oscillator.start(now);
            oscillator.stop(now + 0.1);
        } else if (type === 'task-switch') {
            // Stronger, clearer bip
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(1200, now);
            oscillator.frequency.exponentialRampToValueAtTime(800, now + 0.15);

            gainNode.gain.setValueAtTime(0.3, now); // Increased volume from 0.1
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

            oscillator.start(now);
            oscillator.stop(now + 0.15);
        } else if (type === 'session-end') {
            // Clearer end sequence
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(600, now);
            oscillator.frequency.linearRampToValueAtTime(1200, now + 0.2);
            oscillator.frequency.linearRampToValueAtTime(1800, now + 0.4);

            gainNode.gain.setValueAtTime(0.3, now); // Increased volume
            gainNode.gain.linearRampToValueAtTime(0.3, now + 0.3);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

            oscillator.start(now);
            oscillator.stop(now + 0.6);
        } else if (type === 'target-hit') {
            const exerciseId = arguments[1]; // Get exercise ID from second argument
            let freq = 800;
            let decay = 0.1;
            let type = 'sine';

            // Distinct sound per exercise
            switch (exerciseId) {
                case 'gridshot': freq = 1000; break;
                case 'tracking': freq = 400; decay = 0.05; type = 'triangle'; break;
                case 'microshot': freq = 1200; break;
                case 'sixshot': freq = 1500; break;
                case 'headshot': freq = 1800; break;
                case 'spidershot': freq = 900; break;
                case 'reflex': freq = 2000; break;
                case 'wallshot': freq = 700; break;
                case 'precision_final': freq = 2200; break;
                default: freq = 1000;
            }

            oscillator.type = type;
            oscillator.frequency.setValueAtTime(freq, now);
            oscillator.frequency.exponentialRampToValueAtTime(freq / 2, now + decay);

            gainNode.gain.setValueAtTime(0.15, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + decay);

            oscillator.start(now);
            oscillator.stop(now + decay);
        }
    }

    init() {
        this.setupRenderer();
        this.setupLights();
        this.setupEnvironment();
        this.addEventListeners();
        this.animate();
    }

    setupRenderer() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        // Reculé de 5 unités pour voir plus grand (Valorant distance standard environ)
        this.camera.position.set(0, 0, 5);
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0x00f2ff, 150);
        pointLight.position.set(5, 5, 5);
        this.scene.add(pointLight);

        const pointLight2 = new THREE.PointLight(0xff00ff, 100);
        pointLight2.position.set(-5, 2, -2);
        this.scene.add(pointLight2);
    }

    setupEnvironment() {
        // Grid floor for depth perception
        const size = 20;
        const divisions = 20;
        const gridHelper = new THREE.GridHelper(size, divisions, 0x333333, 0x111111);
        gridHelper.rotation.x = Math.PI / 2;
        gridHelper.position.z = -5;
        this.scene.add(gridHelper);

        // Background / Fog
        this.scene.background = new THREE.Color(0x050505);
        this.scene.fog = new THREE.Fog(0x050505, 5, 15);
    }

    addEventListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Pointer Lock
        document.addEventListener('pointerlockchange', () => {
            this.isLocked = document.pointerLockElement === this.canvas;
            if (!this.isLocked && this.isActive && !this.isPaused) {
                this.pauseGame();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isLocked || !this.isActive || this.isPaused) return;

            // Facteur de compensation pour compenser la latence et le polling du navigateur
            const BROWSER_COMPENSATION = 1.08;
            const scale = (window.devicePixelRatio || 1) * BROWSER_COMPENSATION;

            const moveX = (e.movementX || 0) * scale;
            const moveY = (e.movementY || 0) * scale;

            // Math: move * sensitivity * 0.07 degrees converted to radians
            const degToRad = Math.PI / 180;
            this.yaw -= (moveX * this.sensitivity * this.VALO_DEG_PER_COUNT) * degToRad;
            this.pitch -= (moveY * this.sensitivity * this.VALO_DEG_PER_COUNT) * degToRad;

            // Clamp pitch to avoid flipping
            this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.pitch));

            this.camera.rotation.order = 'YXZ';
            this.camera.rotation.set(this.pitch, this.yaw, 0);
        });

        // Click detection
        window.addEventListener('mousedown', (e) => {
            if (!this.isActive || this.isPaused) return;
            if (!this.isLocked) {
                this.canvas.requestPointerLock();
                return;
            }
            this.handleShoot();
        });

        // Crosshair listener
        this.ui.crosshairCodeInput.addEventListener('input', (e) => {
            this.parseCrosshairCode(e.target.value);
        });

        // Settings updates
        this.ui.sensitivityInput.addEventListener('input', (e) => {
            this.sensitivity = parseFloat(e.target.value);
            this.ui.sensitivityNum.value = this.sensitivity.toFixed(3);
        });

        this.ui.sensitivityNum.addEventListener('input', (e) => {
            let val = parseFloat(e.target.value) || 0;
            this.sensitivity = val;
            this.ui.sensitivityInput.value = val;
        });

        this.ui.startBtn.addEventListener('click', () => {
            if (this.isPaused) {
                this.resumeGame();
            } else {
                this.startGame();
            }
        });
        this.ui.retryBtn.addEventListener('click', () => this.startGame());

        this.ui.quitBtn.addEventListener('click', () => this.quitSession());

        // Movement listeners
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) this.keys[key] = true;
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) this.keys[key] = false;
        });

        // Time selection
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

        // Adjust spawn times for existing targets so reaction stats remain accurate
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

        // Clear targets
        this.targets.forEach(t => this.scene.remove(t));
        this.targets = [];
        this.spawnedTargetsAt.clear();

        // Reset UI
        this.ui.menu.classList.remove('hidden');
        this.ui.hud.classList.add('hidden');
        this.ui.results.classList.add('hidden');
        this.ui.quitBtn.classList.add('hidden');
        this.ui.startBtn.textContent = "DÉMARRER LA SESSION";

        if (document.pointerLockElement === this.canvas) {
            document.exitPointerLock();
        }
    }

    startGame() {
        this.score = 0;
        this.clicks = 0;
        this.hits = 0;
        this.reactionTimes = [];
        this.currentTaskIndex = 0;
        this.updateCurrentTask();
        this.startTime = performance.now();
        this.totalPausedDuration = 0;
        this.lastSpawnTime = 0;
        this.isActive = true;
        this.isPaused = false;
        this.ui.startBtn.textContent = "DÉMARRER LA SESSION";
        this.ui.quitBtn.classList.add('hidden');
        this.yaw = 0;
        this.pitch = 0;
        this.camera.rotation.set(0, 0, 0);
        this.camera.position.set(0, 0, 5); // Reset position too

        // Task duration depends on session duration
        this.taskDuration = this.sessionDuration / this.playlist.length;

        // Lock pointer with raw input if available
        if (this.canvas.requestPointerLock) {
            this.canvas.requestPointerLock({
                unadjustedMovement: true
            }).catch(() => {
                this.canvas.requestPointerLock();
            });
        }

        // Clear existing targets
        this.targets.forEach(t => this.scene.remove(t));
        this.targets = [];
        this.spawnedTargetsAt.clear();

        // UI
        this.ui.menu.classList.add('hidden');
        this.ui.results.classList.add('hidden');
        this.ui.hud.classList.remove('hidden');
        this.updateHUD();
    }

    updateCurrentTask() {
        const task = this.playlist[this.currentTaskIndex];
        this.currentMode = task.id;
        this.spawnDelay = task.spawnRate;
        this.ui.taskName.textContent = task.name;

        // Sound feedback
        this.playNotificationSound('task-switch');

        // Clear targets on switch
        this.targets.forEach(t => this.scene.remove(t));
        this.targets = [];

        // If tracking, spawn 1 initial target
        if (task.type === 'tracking') {
            this.spawnTarget();
        }
    }

    parseCrosshairCode(code) {
        if (!code) return;
        try {
            const params = {};
            const parts = code.split(';');
            for (let i = 0; i < parts.length; i += 2) {
                if (parts[i] && parts[i + 1]) params[parts[i]] = parts[i + 1];
            }

            // Simple map: 0t = thickness, 0l = length, 0o = offset, 0a = opacity, c = color
            const root = document.documentElement;

            // Color map (Valorant indices)
            const colors = ['#ffffff', '#00ff00', '#ffff00', '#00ff00', '#ffff00', '#00ffff', '#ff00ff', '#ffffff'];
            if (params['c'] !== undefined) {
                const cIndex = parseInt(params['c']);
                if (colors[cIndex]) root.style.setProperty('--accent-color', colors[cIndex]);
            }

            const thickness = params['0t'] || 2;
            const length = params['0l'] || 6;
            const offset = params['0o'] || 2;
            const opacity = params['0a'] || 1;

            root.style.setProperty('--ch-thickness', `${thickness}px`);
            root.style.setProperty('--ch-width', `${length * 2 + offset * 2}px`);
            // We could add more complex CSS but this covers basics
        } catch (e) {
            console.error("Invalid crosshair code", e);
        }
    }

    endGame() {
        this.isActive = false;

        // Calculate results
        const accuracy = this.clicks > 0 ? Math.round((this.hits / this.clicks) * 100) : 0;
        const avgReaction = this.reactionTimes.length > 0
            ? Math.round(this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length)
            : 0;

        const currentResult = {
            score: this.score,
            accuracy,
            reaction: avgReaction,
            date: Date.now()
        };

        // Analysis logic
        this.analyzeStats(currentResult);

        // Save history
        this.history.push(currentResult);
        if (this.history.length > 50) this.history.shift();
        localStorage.setItem('strac_aim_history', JSON.stringify(this.history));

        this.ui.resScore.textContent = this.score;
        this.ui.resAccuracy.textContent = `${accuracy}%`;
        this.ui.resReaction.textContent = `${avgReaction}ms`;

        // Sound feedback
        this.playNotificationSound('session-end');

        this.ui.hud.classList.add('hidden');
        this.ui.results.classList.remove('hidden');

        if (document.pointerLockElement === this.canvas) {
            document.exitPointerLock();
        }
    }

    analyzeStats(current) {
        if (this.history.length === 0) {
            this.ui.analysisText.textContent = "C'est votre première session ! Établissez une base avant de comparer.";
            this.ui.tipText.textContent = "Concentrez-vous sur la précision plutôt que sur la vitesse pour commencer.";
            return;
        }

        const last = this.history[this.history.length - 1];
        const scoreDiff = current.score - last.score;
        const accDiff = current.accuracy - last.accuracy;

        let analysis = "";
        if (scoreDiff > 0) {
            analysis += `Progression de ${scoreDiff} points par rapport à la dernière fois ! `;
        } else {
            analysis += `Score légèrement inférieur (${scoreDiff}). `;
        }

        if (accDiff > 0) {
            analysis += `Votre précision s'améliore (+${accDiff}%).`;
        } else if (accDiff < 0) {
            analysis += `Attention à votre précision (${accDiff}%).`;
        }

        this.ui.analysisText.textContent = analysis;

        // Tips based on stats
        if (current.accuracy < 85) {
            this.ui.tipText.textContent = "Votre précision est faible. Ralentissez vos mouvements et assurez-vous de confirmer chaque tir.";
        } else if (current.reaction > 300) {
            this.ui.tipText.textContent = "Vos réflexes sont un peu lents. Essayez de réduire votre temps de focalisation sur chaque cible.";
        } else {
            this.ui.tipText.textContent = "Excellente session ! Pour progresser, essayez d'augmenter légèrement votre vitesse de transition.";
        }
    }

    spawnTarget() {
        const task = this.playlist[this.currentTaskIndex];
        const geometry = new THREE.SphereGeometry(task.size, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: task.color,
            emissive: task.color,
            emissiveIntensity: 0.5,
            metalness: 0.8,
            roughness: 0.2
        });
        const target = new THREE.Mesh(geometry, material);

        target.position.x = (Math.random() - 0.5) * task.xRange;
        target.position.y = (task.id === 'headshot') ? 0 : (Math.random() - 0.5) * task.yRange;
        target.position.z = -5;

        if (task.type === 'tracking') {
            target.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.1,
                (Math.random() - 0.5) * 0.1,
                0
            );
            target.isTrackingTarget = true;
        }

        this.scene.add(target);
        this.targets.push(target);
        this.spawnedTargetsAt.set(target.uuid, performance.now());
    }

    handleShoot() {
        this.clicks++;

        // Raycast from center (0,0) as we use a fixed crosshair
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.targets);

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            this.handleHit(hit);
        }
        this.updateHUD();
    }

    handleHit(target) {
        this.hits++;
        this.score += 100;

        // Sound feedback
        this.playNotificationSound('target-hit', this.playlist[this.currentTaskIndex].id);

        // Calculate reaction time
        const spawnTime = this.spawnedTargetsAt.get(target.uuid);
        this.reactionTimes.push(performance.now() - spawnTime);

        // Remove from scene and array
        this.scene.remove(target);
        this.targets = this.targets.filter(t => t !== target);
        this.spawnedTargetsAt.delete(target.uuid);

        // Visual feedback (simple target flash/removal)
        // In a real game we'd add particles here

        // Spawn a new one immediately if it's "one out - one in" style
        // Or we let the timer handle it. The user asked for "une nouvelle cible doit apparaître".
        this.spawnTarget();
    }

    updateHUD() {
        this.ui.scoreLabel.textContent = this.score.toString().padStart(3, '0');
        const accuracy = this.clicks > 0 ? Math.round((this.hits / this.clicks) * 100) : 100;
        this.ui.accuracyLabel.textContent = `${accuracy}%`;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.isActive && !this.isPaused) {
            this.handleMovement();
            const now = performance.now();
            const totalElapsed = (now - this.startTime - this.totalPausedDuration) / 1000;
            const remainingTotal = Math.max(0, this.sessionDuration - totalElapsed);

            // Global timer format MM:SS
            const mins = Math.floor(remainingTotal / 60);
            const secs = Math.floor(remainingTotal % 60);
            this.ui.timerLabel.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

            // Task rotation logic
            const currentTaskElapsed = totalElapsed % this.taskDuration;
            const nextTaskRemaining = Math.ceil(this.taskDuration - currentTaskElapsed);
            this.ui.nextTaskTimer.textContent = `NEXT TASK: ${nextTaskRemaining}s`;

            const newTaskIndex = Math.floor(totalElapsed / this.taskDuration);
            if (newTaskIndex !== this.currentTaskIndex && newTaskIndex < this.playlist.length) {
                this.currentTaskIndex = newTaskIndex;
                this.updateCurrentTask();
            }

            if (remainingTotal <= 0) {
                this.endGame();
            }

            // Tracking logic
            const task = this.playlist[this.currentTaskIndex];
            if (task.id === 'tracking') {
                this.handleTracking(now);
            }

            // Continuous spawning logic
            if (task.spawnRate > 0 && now - this.lastSpawnTime > this.spawnDelay) {
                if (this.targets.length < 5) { // Limit number of targets on screen
                    this.spawnTarget();
                    this.lastSpawnTime = now;
                }
            }

            // Subtle target animation & Tracking movement
            this.targets.forEach(t => {
                if (t.isTrackingTarget) {
                    t.position.x += t.velocity.x;
                    t.position.y += t.velocity.y;

                    // Bounce off boundaries
                    if (Math.abs(t.position.x) > task.xRange / 2) t.velocity.x *= -1;
                    if (Math.abs(t.position.y) > task.yRange / 2) t.velocity.y *= -1;
                }

                t.scale.x = 1 + Math.sin(now * 0.005) * 0.05;
                t.scale.y = 1 + Math.sin(now * 0.005) * 0.05;
                t.scale.z = 1 + Math.sin(now * 0.005) * 0.05;
            });
        }

        this.renderer.render(this.scene, this.camera);
    }

    handleTracking(now) {
        // For tracking, we don't count "clicks" but continuous alignment
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.targets);

        if (intersects.length > 0) {
            this.score += 2; // Continuous small points
            this.hits += 0.02; // Hack to keep accuracy sensible
            this.clicks += 0.02;

            // Subtle tracking sound (low frequency tick)
            if (Math.random() < 0.1) { // Don't play every frame to avoid noise
                this.playNotificationSound('target-hit', 'tracking');
            }

            // Visual feedback
            intersects[0].object.material.emissiveIntensity = 2.0;
        } else {
            this.clicks += 0.02;
            this.targets.forEach(t => t.material.emissiveIntensity = 0.5);
        }
        this.updateHUD();
    }

    handleMovement() {
        const direction = new THREE.Vector3();
        const front = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);

        // Zero out Y for ground movement
        front.y = 0;
        right.y = 0;
        front.normalize();
        right.normalize();

        if (this.keys.w || this.keys.z) direction.add(front);
        if (this.keys.s) direction.sub(front);
        if (this.keys.a || this.keys.q) direction.sub(right);
        if (this.keys.d) direction.add(right);

        if (direction.length() > 0) {
            direction.normalize().multiplyScalar(this.moveSpeed);
            this.camera.position.add(direction);
        }

        // Simple boundaries
        this.camera.position.x = Math.max(-10, Math.min(10, this.camera.position.x));
        this.camera.position.z = Math.max(-5, Math.min(15, this.camera.position.z));
    }
}

// Start the app
new AimTrainer();
