import { useState, useRef, useCallback, useEffect } from "react";

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isStartingRef = useRef(false);

  const stopLevelPolling = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startLevelPolling = useCallback((analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount);

    const poll = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const normalized = (data[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / data.length);
      setAudioLevel(Math.min(1, rms * 4));
      animFrameRef.current = requestAnimationFrame(poll);
    };

    animFrameRef.current = requestAnimationFrame(poll);
  }, []);

  const startRecording = useCallback(async () => {
    if (isStartingRef.current || mediaRecorderRef.current) return;
    isStartingRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioContext;

      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      startLevelPolling(analyser);
    } catch (err) {
      console.error("Error accessing microphone", err);
    } finally {
      isStartingRef.current = false;
    }
  }, [startLevelPolling]);

  const stopRecording = useCallback((): Promise<{ audioBase64: string; mimeType: string; durationSeconds: number }> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current) {
        reject(new Error("No media recorder available"));
        return;
      }

      stopLevelPolling();

      const stopTime = Date.now();
      const durationSeconds =
        startTimeRef.current != null
          ? (stopTime - startTimeRef.current) / 1000
          : 0;

      mediaRecorderRef.current.onstop = () => {
        const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });

        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1];
          resolve({ audioBase64: base64, mimeType, durationSeconds });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);

        mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;

        audioContextRef.current?.close();
        audioContextRef.current = null;

        setIsRecording(false);
      };

      mediaRecorderRef.current.stop();
    });
  }, [stopLevelPolling]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close();
    };
  }, []);

  return {
    isRecording,
    audioLevel,
    startRecording,
    stopRecording,
  };
}
