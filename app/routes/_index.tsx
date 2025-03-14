import { useState, useEffect } from "react";
import { json, type LoaderFunction } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";

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
  const { initialMessage } = useLoaderData<{ initialMessage: string }>();

  useEffect(() => {
    setMessages([{ text: initialMessage, isUser: false }]);
  }, [initialMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setMessages(prev => [...prev, { text: input, isUser: true }]);
    setInput("");
    setIsTyping(true);

    try {
      const serverURL = process.env.SERVER_URL?.toString()
      const response = await fetch(`${serverURL}/query/?question=${encodeURIComponent(input)}`);
      const data: { data: { answer: string } } = await response.json();

      setTimeout(() => {
        setMessages(prev => [...prev, { text: data.data.answer, isUser: false }]);
        setIsTyping(false);
      }, 1000);
    } catch (error) {
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

        {/* Chat Area */}
        <div className="h-[500px] overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-indigo-900 scrollbar-track-stone-900">
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
                {msg.text}
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