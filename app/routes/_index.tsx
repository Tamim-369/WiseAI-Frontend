import { useState, useEffect, useRef } from "react";
import { json, type LoaderFunction } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import Markdown from "markdown-to-jsx";
import { MdKeyboardVoice } from "react-icons/md";

export const loader: LoaderFunction = async () => {
  return json({ initialMessage: "Welcome to Wise AI" });
};

interface Message {
  text: string;
  isUser: boolean;
}

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [isStreamingAudio, setIsStreamingAudio] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [isListening, setIsListening] = useState<boolean>(false);
  const { initialMessage } = useLoaderData<{ initialMessage: string }>();
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);

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
      const transcript = event.results[event.results.length - 1][0].transcript;
      setInput(transcript);
      handleVoiceSubmit(transcript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (isListening && event.error !== "aborted") {
        setTimeout(() => recognition.start(), 100);
      }
    };

    recognition.onend = () => {
      if (isListening) {
        setTimeout(() => recognition.start(), 100);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [isListening]);

  // Control listening state
  useEffect(() => {
    if (!recognitionRef.current) return;
    if (isListening) recognitionRef.current.start();
    else recognitionRef.current.abort();
  }, [isListening]);

  // Scroll to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping, isStreamingAudio]);

  useEffect(() => {
    setMessages([{ text: initialMessage, isUser: false }]);
  }, [initialMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await processMessage(input);
  };

  const handleVoiceSubmit = async (text: string) => {
    if (!text.trim()) return;
    await processMessage(text);
  };

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
    }
  };

  const processMessage = async (text: string) => {
    setMessages((prev) => [...prev, { text, isUser: true }]);
    setInput("");
    setIsTyping(true);

    try {
      setChatHistory((prev) => [...prev, { role: "user", content: text }]);
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
      setIsStreamingAudio(true);
      const reader = response.body.getReader();

      const processStream = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (mediaSourceRef.current?.readyState === "open") {
              mediaSourceRef.current.endOfStream();
            }
            setIsTyping(false);
            setIsStreamingAudio(false);
            setMessages((prev) => [...prev, { text: "Audio response completed", isUser: false }]);
            setChatHistory((prev) => [
              ...prev,
              { role: "assistant", content: "Audio response" },
            ]);
            mediaSourceRef.current = null;
            sourceBufferRef.current = null;
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

      if (isListening && recognitionRef.current) {
        recognitionRef.current.abort();
        setTimeout(() => recognitionRef.current?.start(), 100);
      }
    } catch (error) {
      console.error("Streaming error:", error);
      setMessages((prev) => [...prev, { text: "The wise one ponders in silence...", isUser: false }]);
      setIsTyping(false);
      setIsStreamingAudio(false);
      if (isListening && recognitionRef.current) {
        recognitionRef.current.abort();
        setTimeout(() => recognitionRef.current?.start(), 100);
      }
    }
  };

  const toggleListening = () => {
    setIsListening((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-950 via-indigo-950 to-purple-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-stone-900/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden border border-indigo-900/50">
        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-4 border-b border-indigo-900/70">
          <h1 className="text-2xl font-bold text-indigo-100 flex items-center gap-2">
            <span className="w-3 h-3 bg-emerald-600 rounded-full animate-pulse"></span>
            Wise AI
          </h1>
          <p className="text-indigo-300 text-sm">Ancient Wisdom Meets Modern Intelligence</p>
        </div>

        <div
          ref={chatContainerRef}
          className="h-[500px] overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-indigo-900 scrollbar-track-stone-900"
        >
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.isUser ? "justify-end" : "justify-start"} animate-slideIn`}
            >
              <div
                className={`max-w-[70%] p-4 rounded-xl ${msg.isUser
                  ? "bg-indigo-900 text-indigo-100"
                  : "bg-stone-800 text-stone-100 border border-indigo-900/30"
                  } transform transition-all hover:scale-105`}
              >
                <Markdown>{msg.text}</Markdown>
              </div>
            </div>
          ))}
          {isTyping && !isStreamingAudio && (
            <div className="flex justify-start">
              <div className="bg-stone-800 p-4 rounded-xl flex gap-2">
                <span className="w-2 h-2 bg-indigo-700 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-indigo-700 rounded-full animate-bounce delay-100"></span>
                <span className="w-2 h-2 bg-indigo-700 rounded-full animate-bounce delay-200"></span>
              </div>
            </div>
          )}
          {isStreamingAudio && (
            <div className="flex justify-start">
              <div className="bg-stone-800 p-4 rounded-xl flex items-center gap-2 text-stone-100">
                <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
                <span>Streaming audio...</span>
              </div>
            </div>
          )}
        </div>

        <Form onSubmit={handleSubmit} className="p-4 border-t border-indigo-900/70">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Seek wisdom... (or use voice)"
              className="flex-1 bg-stone-800 text-stone-100 placeholder-stone-500 border border-indigo-900/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-700 transition-all duration-300"
            />
            <button
              type="button"
              onClick={toggleListening}
              className={`p-3 rounded-xl transition-all duration-300 ${isListening ? "bg-red-900 hover:bg-red-800" : "bg-indigo-900 hover:bg-indigo-800"
                }`}
            >
              <MdKeyboardVoice size={25} className="text-white" />
            </button>
            <button
              type="submit"
              className="bg-indigo-900 hover:bg-indigo-800 text-indigo-100 px-6 py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-indigo-900/30"
            >
              Ask
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}