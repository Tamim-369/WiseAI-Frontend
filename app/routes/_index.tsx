import { useState, useEffect, useRef } from "react";
import { json, type LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import Markdown from "markdown-to-jsx";

export const loader: LoaderFunction = async () => {
  return json({ initialMessage: "" }); // No default message
};

interface Message {
  text: string;
  isUser: boolean;
}

export default function Index() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<any>([]);
  const { initialMessage } = useLoaderData<{ initialMessage: string }>();
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any | null>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // No initial message by default
  useEffect(() => {
    if (initialMessage) {
      setMessages([{ text: initialMessage, isUser: false }]);
      speakText(initialMessage);
    }
  }, [initialMessage]);

  // Setup Speech Recognition
  useEffect(() => {
    //@ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        handleVoiceInput(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech Recognition Error:", event.error);
      };
    } else {
      console.warn("Speech Recognition not supported in this browser.");
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const speakText = async (text: string) => {
    try {
      const response = await fetch("https://wiseai.onrender.com/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          chat_history: chatHistory,
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      if (!response.body) throw new Error("No streamable body");

      const fullText = response.headers.get("X-Text") || text; // Get plain text from header
      const sentences = fullText.split(/(?<=[.!?])\s+/).filter(Boolean);
      let typedText = "";
      setMessages(prev => [...prev, { text: "", isUser: false }]);

      const mediaSource = new MediaSource();
      const audio = new Audio();
      audio.src = URL.createObjectURL(mediaSource);

      mediaSource.addEventListener("sourceopen", async () => {
        const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
        const reader = response?.body?.getReader();
        let isFirstChunk = true;
        let sentenceIndex = 0;

        while (true) {
          const { done, value }: any = await reader?.read();
          if (done) {
            mediaSource.endOfStream();
            break;
          }

          try {
            sourceBuffer.appendBuffer(value);
            if (isFirstChunk) {
              audio.play();
              isFirstChunk = false;
            }
            // Type out sentences as audio progresses
            if (sentenceIndex < sentences.length) {
              typedText = sentences.slice(0, sentenceIndex + 1).join(" ");
              setMessages(prev => [
                ...prev.slice(0, -1),
                { text: typedText, isUser: false },
              ]);
              sentenceIndex++;
              await new Promise(resolve => setTimeout(resolve, 500)); // Adjust for timing
            }
          } catch (e) {
            console.warn("Buffer full, waiting...", e);
            await new Promise(resolve => sourceBuffer.addEventListener("updateend", resolve, { once: true }));
            sourceBuffer.appendBuffer(value);
          }
        }
      }, { once: true });
    } catch (error: any) {
      console.error("Streaming Error:", error.message);
      setMessages(prev => [...prev, { text: "The wise one ponders in silence...", isUser: false }]);
    }
  };

  const handleVoiceInput = async (transcript: string) => {
    if (!transcript.trim()) return;

    setMessages(prev => [...prev, { text: transcript, isUser: true }]);
    setIsTyping(true);

    try {
      setChatHistory((prev: any) => [...prev, { role: "user", content: transcript }]);
      setIsTyping(false);
      await speakText(transcript);
    } catch (error) {
      console.log(error);
      setMessages(prev => [...prev, { text: "The wise one ponders in silence...", isUser: false }]);
      setIsTyping(false);
    }
  };

  const startListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
    }
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
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-stone-800 p-4 rounded-xl flex gap-2">
                <span className="w-2 h-2 bg-indigo-700 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-indigo-700 rounded-full animate-bounce delay-100"></span>
                <span className="w-2 h-2 bg-indigo-700 rounded-full animate-bounce delay-200"></span>
              </div>
            </div>
          )}
        </div>
        <div className="p-6 flex justify-center border-t border-indigo-900/70">
          <button
            onClick={startListening}
            className="w-24 h-24 rounded-full bg-indigo-900 hover:bg-indigo-800 flex items-center justify-center transition-all duration-300 hover:shadow-lg hover:shadow-indigo-900/50 focus:outline-none focus:ring-4 focus:ring-indigo-700 animate-pulse"
          >
            <svg
              className="w-12 h-12 text-indigo-100"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}