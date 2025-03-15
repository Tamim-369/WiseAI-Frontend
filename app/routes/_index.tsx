import { useState, useEffect, useRef } from "react";
import { json, type LoaderFunction } from "@remix-run/node";
import { MdKeyboardVoice, MdSend } from "react-icons/md";
import { useLoaderData } from "@remix-run/react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechAlternative;
  length: number;
}

interface SpeechAlternative {
  transcript: string;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export const loader: LoaderFunction = async () => {
  return json({ initialMessage: "Welcome to Wise AI" });
};

export default function Index() {
  const [inputText, setInputText] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { initialMessage } = useLoaderData<{ initialMessage: string }>();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("Speech Recognition API not supported");
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = "en-US";

    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      setInputText(transcript);
    };

    recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
    };

    recognitionRef.current.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    const userMessage: ChatMessage = { role: "user", content: inputText };
    setChatHistory((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    try {
      const response = await fetch("http://127.0.0.1:8000/query/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: inputText, chat_history: chatHistory }),
      });
      if (response.ok) {
        const data = await response.json() as { answer: string };
        setChatHistory((prev) => [...prev, { role: "assistant", content: data.answer }]);
      } else {
        console.error("Query error:", response.status);
        setChatHistory((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong." }])
      }
    } catch (error) {
      console.error("Fetch error:", error);
      setChatHistory((prev) => [...prev, { role: "assistant", content: "Error connecting to server." }])
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-800/90 sm:bg-gradient-to-br from-gray-900 via-indigo-950 to-purple-950 flex flex-col items-center sm:p-6">
      <div className="w-full max-w-3xl flex flex-col h-[100dvh] sm:h-[85vh] bg-gray-800/90 sm:rounded-xl shadow-2xl ">
        <div
          ref={chatContainerRef}
          className="flex-grow p-2 sm:p-6 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-indigo-600 scrollbar-track-gray-700"
        >
          {chatHistory.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-slide-in`}
            >
              <div
                className={`max-w-xs md:max-w-md p-4 rounded-lg shadow-md transition-all duration-300 ${msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-700 text-gray-100 border-l-4 border-indigo-500"
                  }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-xs md:max-w-md p-4 rounded-lg bg-gray-700 text-gray-100 flex items-center space-x-2 animate-pulse">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-200"></div>
                <span>Thinking...</span>
              </div>
            </div>
          )}
        </div>
        <div className=" p-2 sm:p-4 border-t border-gray-700 bg-gray-800/95 flex items-center space-x-3">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`sm:p-3 rounded-full transition-all duration-200 ${isRecording
              ? "sm:bg-red-600 sm:hover:bg-red-700"
              : "sm:bg-indigo-600 sm:hover:bg-indigo-700"
              }`}
          >
            <MdKeyboardVoice size={24} className="text-white" />
          </button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type or speak your message..."
            className="flex-grow w-full p-3 bg-gray-900/80 text-gray-100 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200"
          />
          <button
            onClick={sendMessage}
            disabled={isLoading}
            className={`sm:p-3 rounded-full transition-all duration-200 ${isLoading
              ? "sm:bg-gray-600 cursor-not-allowed"
              : "sm:bg-indigo-600 sm:hover:bg-indigo-700"
              }`}
          >
            <MdSend size={24} className="text-white" />
          </button>
        </div>
      </div>
      <style>{`
        .scrollbar-thin {
          scrollbar-width: thin;
        }
        .scrollbar-thumb-indigo-600 {
          scrollbar-color: #4f46e5 #374151;
        }
        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .delay-100 {
          animation-delay: 0.1s;
        }
        .delay-200 {
          animation-delay: 0.2s;
        }
      `}</style>
    </div>
  );
}