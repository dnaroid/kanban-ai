export type STTStatus = "idle" | "initializing" | "ready" | "speech" | "error";

export type STTEventMap = {
 status: STTStatus;
 partial: string;
 final: string;
 error: string;
};

type SpeechRecognitionEvent = {
 resultIndex: number;
 results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEvent = {
 error: string;
 message?: string;
};

interface SpeechRecognition extends EventTarget {
 continuous: boolean;
 interimResults: boolean;
 lang: string;
 onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
 onend: ((this: SpeechRecognition, ev: Event) => void) | null;
 onerror:
  | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void)
  | null;
 onresult:
  | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
  | null;
 start(): void;
 stop(): void;
 abort(): void;
}

declare global {
 interface Window {
  SpeechRecognition: new () => SpeechRecognition;
  webkitSpeechRecognition: new () => SpeechRecognition;
 }
}

const LANG_MAP: Record<"ru" | "en", string> = {
 ru: "ru-RU",
 en: "en-US",
};

export class WebSpeechController {
 private listeners: Map<keyof STTEventMap, Set<(data: unknown) => void>> =
  new Map();
 private currentStatus: STTStatus = "idle";
 private currentLang: "ru" | "en" = "ru";
 private recognition: SpeechRecognition | null = null;
 private isListening = false;

 constructor() {
  // Detect browser language
  const browserLang = navigator.language.split("-")[0];
  if (browserLang === "ru" || browserLang === "en") {
   this.currentLang = browserLang;
  }
 }

 async init(): Promise<void> {
  const SpeechRecognition =
   window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
   this.setStatus("error");
   this.emit("error", "Web Speech API is not supported in this browser");
   throw new Error("Web Speech API is not supported");
  }

  this.setStatus("initializing");

  try {
   this.recognition = new SpeechRecognition();
   this.recognition.continuous = true;
   this.recognition.interimResults = true;
   this.recognition.lang = LANG_MAP[this.currentLang];

   this.recognition.onstart = () => {
    this.isListening = true;
    this.setStatus("ready");
   };

   this.recognition.onend = () => {
    this.isListening = false;
    if (this.currentStatus !== "error") {
     this.setStatus("idle");
    }
   };

   this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    const message = event.message || event.error;
    this.setStatus("error");
    this.emit("error", message);
   };

   this.recognition.onresult = (event: SpeechRecognitionEvent) => {
    let finalTranscript = "";
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
     const transcript = event.results[i][0].transcript;
     if (event.results[i].isFinal) {
      finalTranscript += transcript;
     } else {
      interimTranscript += transcript;
     }
    }

    if (interimTranscript) {
     this.setStatus("speech");
     this.emit("partial", interimTranscript);
    }

    if (finalTranscript) {
     this.emit("final", finalTranscript);
     this.setStatus("ready");
    }
   };

   this.setStatus("ready");
  } catch (error) {
   this.setStatus("error");
   const message =
    error instanceof Error
     ? error.message
     : "Failed to initialize speech recognition";
   this.emit("error", message);
   throw error;
  }
 }

 sendAudioChunk(_pcm16: Int16Array): void {
  // Not used in Web Speech API - kept for interface compatibility
  console.warn("sendAudioChunk is not used in Web Speech API");
 }

 async setLanguage(lang: "ru" | "en"): Promise<void> {
  if (lang === this.currentLang && this.recognition) {
   return;
  }

  this.currentLang = lang;

  if (this.recognition) {
   this.recognition.lang = LANG_MAP[lang];
  }

  if (this.isListening) {
   this.recognition?.stop();
   await new Promise((resolve) => setTimeout(resolve, 100));
   this.recognition?.start();
  }
 }

 start(): void {
  if (this.recognition && !this.isListening) {
   try {
    this.recognition.start();
   } catch (e) {
    // Already started
   }
  }
 }

 stop(): void {
  if (this.recognition && this.isListening) {
   try {
    this.recognition.stop();
   } catch (e) {
    // Already stopped
   }
  }
 }

 reset(): void {
  this.stop();
  this.setStatus("idle");
 }

 dispose(): void {
  this.stop();
  this.recognition = null;
  this.listeners.clear();
  this.setStatus("idle");
 }

 on<K extends keyof STTEventMap>(
  event: K,
  handler: (data: STTEventMap[K]) => void,
 ): void {
  if (!this.listeners.has(event)) {
   this.listeners.set(event, new Set());
  }
  this.listeners.get(event)!.add(handler as (data: unknown) => void);
 }

 off<K extends keyof STTEventMap>(
  event: K,
  handler: (data: STTEventMap[K]) => void,
 ): void {
  const handlers = this.listeners.get(event);
  if (handlers) {
   handlers.delete(handler as (data: unknown) => void);
  }
 }

 getStatus(): STTStatus {
  return this.currentStatus;
 }

 getCurrentLanguage(): "ru" | "en" {
  return this.currentLang;
 }

 private emit<K extends keyof STTEventMap>(
  event: K,
  data: STTEventMap[K],
 ): void {
  const handlers = this.listeners.get(event);
  if (handlers) {
   handlers.forEach((handler) => {
    handler(data);
   });
  }
 }

 private setStatus(status: STTStatus): void {
  if (this.currentStatus !== status) {
   this.currentStatus = status;
   this.emit("status", status);
  }
 }
}
