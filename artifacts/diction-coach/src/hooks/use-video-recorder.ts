import { useState, useRef, useCallback, useEffect } from "react";

export interface VideoRecorderResult {
  audioBase64: string;
  mimeType: string;
  durationSeconds: number;
  videoFrames: string[];
}

export function useVideoRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const startLevelPolling = useCallback((analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const poll = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const normalized = (data[i] - 128) / 128;
        sum += normalized * normalized;
      }
      setAudioLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      animFrameRef.current = requestAnimationFrame(poll);
    };
    animFrameRef.current = requestAnimationFrame(poll);
  }, []);

  const stopLevelPolling = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);
    audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      setHasPermission(true);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }

      // Wire up AnalyserNode for live audio level
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioContext;
      startLevelPolling(analyser);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(100);
      startTimeRef.current = Date.now();
      setIsRecording(true);
    } catch (err) {
      setHasPermission(false);
      console.error("Failed to start recording:", err);
      throw err;
    }
  }, [startLevelPolling]);

  const stopRecording = useCallback(async (): Promise<VideoRecorderResult> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        reject(new Error("No recorder"));
        return;
      }

      stopLevelPolling();

      const durationSeconds = (Date.now() - startTimeRef.current) / 1000;

      recorder.onstop = async () => {
        const stream = streamRef.current;
        const mimeType = chunksRef.current[0]?.type || "video/webm";
        const videoBlob = new Blob(chunksRef.current, { type: mimeType });

        const videoObjectUrl = URL.createObjectURL(videoBlob);
        setVideoUrl(videoObjectUrl);

        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          if (videoRef.current) {
            videoRef.current.srcObject = null;
          }
        }

        try {
          const videoFrames = await extractFrames(videoBlob, durationSeconds);
          const audioBuffer = await extractAudioAsBase64(videoBlob);

          resolve({
            audioBase64: audioBuffer,
            mimeType: "audio/webm",
            durationSeconds,
            videoFrames,
          });
        } catch (err) {
          reject(err);
        }
      };

      recorder.stop();
      setIsRecording(false);
    });
  }, [stopLevelPolling]);

  const reset = useCallback(() => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoUrl(null);
    setIsRecording(false);
  }, [videoUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      audioContextRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { isRecording, audioLevel, videoUrl, videoRef, hasPermission, startRecording, stopRecording, reset };
}

async function extractFrames(blob: Blob, durationSeconds: number): Promise<string[]> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(blob);
    video.src = url;
    video.muted = true;
    video.preload = "metadata";

    const frames: string[] = [];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    video.onloadedmetadata = async () => {
      const duration = video.duration || durationSeconds;
      canvas.width = 320;
      canvas.height = 240;

      const numFrames = Math.min(5, Math.max(3, Math.floor(duration / 5)));
      const interval = duration / (numFrames + 1);

      for (let i = 1; i <= numFrames; i++) {
        const time = interval * i;
        await seekTo(video, time);
        if (ctx) {
          ctx.drawImage(video, 0, 0, 320, 240);
          frames.push(canvas.toDataURL("image/jpeg", 0.7));
        }
      }

      URL.revokeObjectURL(url);
      resolve(frames);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve([]);
    };

    video.load();
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

async function extractAudioAsBase64(videoBlob: Blob): Promise<string> {
  const arrayBuffer = await videoBlob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < uint8.length; i += chunk) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunk));
  }
  return btoa(binary);
}
