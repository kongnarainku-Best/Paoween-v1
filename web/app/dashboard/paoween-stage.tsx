"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export type PaoweenMood = "idle" | "listening" | "thinking" | "talking" | "done" | "error" | "comic";
type Props = { label?: string; mood?: PaoweenMood };

export function PaoweenStage({ label = "น้องเป๋าวีน พร้อมช่วยคิด", mood = "idle" }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const moodRef = useRef<PaoweenMood>(mood);
  const actionsByMoodRef = useRef<Partial<Record<PaoweenMood, import("three").AnimationAction>>>({});
  const activeActionRef = useRef<import("three").AnimationAction | null>(null);
  const applyMoodRef = useRef<(nextMood: PaoweenMood) => void>(() => {});

  useEffect(() => {
    moodRef.current = mood;
    applyMoodRef.current(mood);
  }, [mood]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || failed) return;
    let disposed = false;
    let raf = 0;
    let renderer: import("three").WebGLRenderer | undefined;
    let observer: IntersectionObserver | undefined;
    let clock: import("three").Clock | undefined;
    let mixer: import("three").AnimationMixer | undefined;
    let actions: import("three").AnimationAction[] = [];
    let root: import("three").Object3D | undefined;
    let scene: import("three").Scene | undefined;
    let camera: import("three").OrthographicCamera | undefined;
    let intersecting = false;
    let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const playbackRate = () => reducedMotion ? 0.65 : 1;
    const shouldAnimate = () => !disposed && !document.hidden && intersecting;
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const draw = () => {
      raf = 0;
      if (disposed || !renderer || !scene || !camera || !clock) return;
      if (shouldAnimate()) {
        mixer?.update(Math.min(clock.getDelta(), 0.05));
        renderer.render(scene, camera);
        raf = requestAnimationFrame(draw);
      }
    };
    const startLoop = () => { if (!raf && shouldAnimate()) raf = requestAnimationFrame(draw); };

    const start = async () => {
      try {
        const THREE = await import("three");
        const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
        if (disposed || !host) return;
        scene = new THREE.Scene();
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.35;
        renderer.domElement.setAttribute("aria-hidden", "true");
        renderer.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          setFailed(true);
        });
        host.prepend(renderer.domElement);

        camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 30);
        camera.position.set(3, 1.9, 10);
        camera.lookAt(0, 0, 0);
        scene.add(new THREE.HemisphereLight(0xfff7e4, 0x768b68, 2.5));
        const key = new THREE.DirectionalLight(0xffe9cb, 3);
        key.position.set(-3, 5, 6);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 1.3);
        fill.position.set(4, 2, -1);
        scene.add(fill);

        const gltf = await new GLTFLoader().loadAsync("/paoween/paoween.glb");
        if (disposed) return;
        root = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(root);
        root.position.sub(bounds.getCenter(new THREE.Vector3()));
        scene.add(root);
        mixer = new THREE.AnimationMixer(root);
        const moodNames: Record<string, PaoweenMood> = {
          Idle: "idle", Listen: "listening", Think: "thinking", Talk: "talking",
          Approval: "done", Done: "done", Error: "error", Comic: "comic",
        };
        const moodActions: Partial<Record<PaoweenMood, import("three").AnimationAction>> = {};
        for (const clip of gltf.animations) {
          const mappedMood = moodNames[clip.name];
          if (!mappedMood || moodActions[mappedMood]) continue;
          const action = mixer.clipAction(clip);
          moodActions[mappedMood] = action;
          actions.push(action);
        }
        if (!moodActions.idle && gltf.animations[0]) {
          const action = mixer.clipAction(gltf.animations[0]);
          moodActions.idle = action;
          actions.push(action);
        }
        actionsByMoodRef.current = moodActions;
        const applyMood = (nextMood: PaoweenMood) => {
          const next = moodActions[nextMood] ?? moodActions.idle;
          if (!next || activeActionRef.current === next) return;
          activeActionRef.current?.fadeOut(0.22);
          next.reset().setEffectiveTimeScale(playbackRate()).fadeIn(0.22).play();
          activeActionRef.current = next;
        };
        applyMoodRef.current = applyMood;
        applyMood(moodRef.current);

        const resize = () => {
          if (!renderer || !camera || !host) return;
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          const half = 1.72;
          const aspect = width / height;
          renderer.setSize(width, height, false);
          camera.left = -half * aspect;
          camera.right = half * aspect;
          camera.top = half;
          camera.bottom = -half;
          camera.updateProjectionMatrix();
          renderer.render(scene!, camera);
        };
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        observer = new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; if (intersecting) startLoop(); else stop(); }, { rootMargin: "80px" });
        observer.observe(host);
        resize();
        setFailed(false);
        host.classList.add("mascot-loaded");
        clock = new THREE.Clock();
        document.addEventListener("visibilitychange", stop);
        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onMotionChange = (event: MediaQueryListEvent) => {
          reducedMotion = event.matches;
          activeActionRef.current?.setEffectiveTimeScale(playbackRate());
          startLoop();
        };
        motionQuery.addEventListener("change", onMotionChange);
        window.addEventListener("resize", resize);
        startLoop();

        cleanup = () => {
          resizeObserver.disconnect();
          observer?.disconnect();
          motionQuery.removeEventListener("change", onMotionChange);
          window.removeEventListener("resize", resize);
          document.removeEventListener("visibilitychange", stop);
          stop();
        };
      } catch {
        if (!disposed) setFailed(true);
      }
    };

    let cleanup = () => {};
    const visibilityStart = () => { if (!document.hidden && intersecting) startLoop(); };
    document.addEventListener("visibilitychange", visibilityStart);
    const nearViewport = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer?.disconnect();
        start();
      }
    }, { rootMargin: "160px" });
    nearViewport.observe(host);
    return () => {
      disposed = true;
      nearViewport.disconnect();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibilityStart);
      cleanup();
      stop();
      actions.forEach((action) => action.stop());
      actionsByMoodRef.current = {};
      activeActionRef.current = null;
      applyMoodRef.current = () => {};
      mixer?.stopAllAction();
      root?.traverse((object) => {
        const mesh = object as import("three").Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        materials.forEach((material) => {
          Object.values(material).forEach((value) => {
            if (value && typeof value === "object" && "dispose" in value && typeof value.dispose === "function") value.dispose();
          });
          material.dispose();
        });
      });
      renderer?.dispose();
      renderer?.domElement.remove();
      host.classList.remove("mascot-loaded");
    };
  }, [failed]);

  return <div className="paoween-stage" aria-label={label}>
    <div className="paoween-canvas" ref={hostRef}>
      <Image className="paoween-poster" src="/paoween/paoween.webp" alt="" fill priority sizes="(max-width: 700px) 118px, 200px" unoptimized />
    </div>
    <span className="paoween-status"><i />พร้อมช่วยคิด</span>
  </div>;
}
