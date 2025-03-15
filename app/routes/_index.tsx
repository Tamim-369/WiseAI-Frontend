import { useState, useEffect, useRef } from "react";
import { json, type LoaderFunction } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import Markdown from "markdown-to-jsx";
import axios from "axios";

export const loader: LoaderFunction = async () => {
  return json({ initialMessage: "Welcome to Wise AI" });
};

interface Message {
  text: string;
  isUser: boolean;
}

export default function Index() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<any>([]);
  const { initialMessage } = useLoaderData<{ initialMessage: string }>();

  // Create a ref for the chat container
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    setMessages([{ text: initialMessage, isUser: false }]);
  }, [initialMessage]);

  const speakText = async (text: string) => {
    // Basic Markdown cleanup function
    const stripMarkdown = (input: string): string => {
      return input
        .replace(/[#*_-]{1,3}/g, "") // Remove headings (#), bold/italic (**/*/-), etc.
        .replace(/\[(.*?)\]\(.*?\)/g, "$1") // Extract link text, remove URLs ([text](url) -> text)
        .replace(/`{1,3}.*?`{1,3}/g, match => match.replace(/`/g, "")) // Remove backticks, keep code content
        .replace(/^\s+|\s+$/g, "") // Trim extra whitespace
        .replace(/\s+/g, " "); // Normalize spaces
    };

    try {
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean).map(stripMarkdown);
      const mediaSource = new MediaSource();
      const audio = new Audio();
      audio.src = URL.createObjectURL(mediaSource);

      mediaSource.addEventListener("sourceopen", async () => {
        const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
        let isFirstChunk = true;

        for (const sentence of sentences) {
          const response = await fetch(
            "https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB/stream",
            {
              method: "POST",
              headers: {
                "xi-api-key": "sk_4cca96141ec51dbce34251e512d35e90a831b01c0b7c8dd3",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                text: sentence,
                model_id: "eleven_monolingual_v1",
                voice_settings: {
                  stability: 0.2,
                  similarity_boost: 1.0,
                },
              }),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }

          const reader = response.body!.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            try {
              sourceBuffer.appendBuffer(value);
              if (isFirstChunk) {
                audio.play();
                isFirstChunk = false;
              }
            } catch (e) {
              console.warn("Buffer full, waiting...", e);
              await new Promise(resolve => sourceBuffer.addEventListener("updateend", resolve, { once: true }));
              sourceBuffer.appendBuffer(value);
            }
          }
        }

        mediaSource.endOfStream();
      }, { once: true });

    } catch (error: any) {
      console.error("ElevenLabs Streaming Error:", error.message);
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setMessages(prev => [...prev, { text: input, isUser: true }]);
    setInput("");
    setIsTyping(true);

    try {
      setChatHistory((prev: any) => [
        ...prev,
        { role: "user", content: input },
      ]);
      const serverURL = 'https://wiseai.onrender.com';
      const response = await fetch(`${serverURL}/query`, {
        method: "post",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: input,
          chat_history: chatHistory
        })
      });

      const data: { data: { answer: string } } = await response.json();
      setChatHistory((prev: any) => [
        ...prev,
        { role: "user", content: input },
        { role: "assistant", content: data.data.answer },
      ]);
      setTimeout(() => {
        setMessages(prev => [...prev, { text: data.data.answer, isUser: false }]);
        setIsTyping(false);
      }, 1000);
      console.log(chatHistory);
      await speakText(data.data.answer)
    } catch (error) {
      console.log(error);
      setMessages(prev => [...prev, { text: "The wise one ponders in silence...", isUser: false }]);
      setIsTyping(false);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-950 via-indigo-950 to-purple-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-stone-900/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden border border-indigo-900/50">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-4 border-b border-indigo-900/70">
          <h1 className="text-2xl font-bold text-indigo-100 flex items-center gap-2">
            <span className="w-3 h-3 bg-emerald-600 rounded-full animate-pulse"></span>
            Wise AI
          </h1>
          <p className="text-indigo-300 text-sm">Ancient Wisdom Meets Modern Intelligence</p>
        </div>

        {/* Chat Area - added ref here */}
        <div
          ref={chatContainerRef}
          className="h-[500px] overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-indigo-900 scrollbar-track-stone-900"
        >
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'} animate-slideIn`}
            >
              <div
                className={`max-w-[70%] p-4 rounded-xl ${msg.isUser
                  ? 'bg-indigo-900 text-indigo-100'
                  : 'bg-stone-800 text-stone-100 border border-indigo-900/30'
                  } transform transition-all hover:scale-105`}
              >
                <Markdown>
                  {msg.text}
                </Markdown>
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

        {/* Input Area */}
        <Form onSubmit={handleSubmit} className="p-4 border-t border-indigo-900/70">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Seek wisdom..."
              className="flex-1 bg-stone-800 text-stone-100 placeholder-stone-500 border border-indigo-900/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-700 transition-all duration-300"
            />
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