import { useState, useEffect, useRef } from "react";
import { json, type LoaderFunction } from "@remix-run/node";
import { MdKeyboardVoice } from "react-icons/md";
import { useLoaderData } from "@remix-run/react";

export const loader: LoaderFunction = async () => {
  return json({ initialMessage: "Welcome to Wise AI" });
};

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export default function Index() {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isStreamingAudio, setIsStreamingAudio] = useState<boolean>(false);
  const [noSpeechDetected, setNoSpeechDetected] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const { initialMessage } = useLoaderData<{ initialMessage: string }>();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recognitionStateRef = useRef<"idle" | "running" | "aborted">("idle");
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const lastTranscriptRef = useRef<string>(""); // To prevent feedback loop

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("Speech Recognition not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      setNoSpeechDetected(false);
      const transcript = event.results[event.results.length - 1][0].transcript.trim();

      // Prevent immediate re-transcription of the same output
      if (transcript === lastTranscriptRef.current && isStreamingAudio) {
        return;
      }

      // If audio is playing, stop it immediately
      if (isStreamingAudio && audioRef.current) {
        audioRef.current.pause();
        if (mediaSourceRef.current?.readyState === "open") {
          mediaSourceRef.current.endOfStream();
        }
        setIsStreamingAudio(false);
        mediaSourceRef.current = null;
        sourceBufferRef.current = null;
      }

      handleVoiceSubmit(transcript);
    };

    recognition.onerror = (event) => {
      if (event.error !== "aborted") {
        console.error("Speech recognition error:", event.error);
      }
      recognitionStateRef.current = "aborted";
      if (event.error === "no-speech") {
        setNoSpeechDetected(true);
      }
      if (isListening && event.error !== "aborted") {
        setTimeout(() => {
          if (recognitionStateRef.current !== "running") {
            recognition.start();
            recognitionStateRef.current = "running";
          }
        }, 200);
      }
    };

    recognition.onend = () => {
      recognitionStateRef.current = "idle";
      if (isListening) {
        setTimeout(() => {
          if (recognitionStateRef.current !== "running") {
            recognition.start();
            recognitionStateRef.current = "running";
          }
        }, 200);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionStateRef.current = "aborted";
      }
    };
  }, [isListening]);

  // Control listening state
  useEffect(() => {
    if (!recognitionRef.current) return;
    if (isListening && recognitionStateRef.current !== "running") {
      recognitionRef.current.start();
      recognitionStateRef.current = "running";
      setNoSpeechDetected(false);
    } else if (!isListening && recognitionStateRef.current === "running") {
      recognitionRef.current.abort();
      recognitionStateRef.current = "aborted";
    }
  }, [isListening]);

  const setupMediaSource = () => {
    if (!mediaSourceRef.current) {
      mediaSourceRef.current = new MediaSource();
      audioRef.current = new Audio(URL.createObjectURL(mediaSourceRef.current));
      audioRef.current.autoplay = true;

      mediaSourceRef.current.addEventListener("sourceopen", () => {
        if (!mediaSourceRef.current) return;
        sourceBufferRef.current = mediaSourceRef.current.addSourceBuffer("audio/mpeg");
        sourceBufferRef.current.mode = "sequence";
      });

      audioRef.current.addEventListener("ended", () => {
        setIsStreamingAudio(false);
        mediaSourceRef.current = null;
        sourceBufferRef.current = null;
      });
    }
  };

  const handleVoiceSubmit = async (text: string) => {
    if (!text) return;
    lastTranscriptRef.current = text; // Store last transcript to check for feedback
    setChatHistory((prev) => [...prev, { role: "user", content: text }]);
    setIsStreamingAudio(true);
    setNoSpeechDetected(false);

    try {
      const serverURL = "http://127.0.0.1:8000";
      const response = await fetch(`${serverURL}/query/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, chat_history: chatHistory }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to fetch audio stream");
      }

      setupMediaSource();
      const reader = response.body.getReader();

      const processStream = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (mediaSourceRef.current?.readyState === "open") {
              mediaSourceRef.current.endOfStream();
            }
            setChatHistory((prev) => [
              ...prev,
              { role: "assistant", content: "Audio response" },
            ]);
            break;
          }

          if (sourceBufferRef.current && !sourceBufferRef.current.updating) {
            try {
              sourceBufferRef.current.appendBuffer(value);
            } catch (error) {
              console.error("Error appending to source buffer:", error);
            }
          }
        }
      };

      await processStream();
    } catch (error) {
      console.error("Streaming error:", error);
      setIsStreamingAudio(false);
    }
  };

  const toggleListening = () => {
    setIsListening((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-950 via-indigo-950 to-purple-950 flex items-center justify-center">
      <div className="relative flex items-center justify-center">
        {/* Outer Circle */}
        <div
          className={`w-48 h-48 rounded-full bg-stone-900/95 border-4 transition-all duration-300 ${isListening ? "border-red-900" : "border-indigo-900"
            } flex items-center justify-center`}
        >
          {/* Inner Circle */}
          <div
            className={`w-32 h-32 rounded-full bg-indigo-900/70 transition-all duration-300 ${isStreamingAudio ? "animate-pulse" : ""
              } flex items-center justify-center`}
          >
            {/* Voice Icon Button */}
            <button
              onClick={toggleListening}
              className="focus:outline-none"
              aria-label="Toggle speech recognition"
            >
              <MdKeyboardVoice
                size={48}
                className={`text-white transition-transform duration-300 ${isListening ? "scale-110" : ""
                  }`}
              />
            </button>
          </div>
        </div>
        {/* Status Indicator */}
        {isStreamingAudio && (
          <div className="absolute bottom-0 text-stone-100 text-sm bg-stone-800 px-2 py-1 rounded-full">
            Speaking...
          </div>
        )}
        {isListening && !isStreamingAudio && noSpeechDetected && (
          <div className="absolute bottom-0 text-stone-100 text-sm bg-stone-800 px-2 py-1 rounded-full">
            Speak now...
          </div>
        )}
      </div>
    </div>
  );
}