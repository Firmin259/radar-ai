// eslint-disable-next-line no-unused-vars
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Loader2, LogOut, Plus, MessageSquare, Menu, Sparkles, Image as ImageIcon } from 'lucide-react';
import { auth, db, signOut } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import Login from './Login';

const rawUrl = import.meta.env.VITE_BACKEND_URL || 'https://radar-ai-mljr.onrender.com';
// ✅ FIX: Clean regex without unnecessary escape characters
const cleanUrl = rawUrl.replace(/[[\]"]/g, '').trim();
const BACKEND_URL = cleanUrl.startsWith('http') 
  ? cleanUrl.replace(/\/+$/, '') 
  : `https://${cleanUrl.replace(/\/+$/, '')}`;

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Radar AI tactical intelligence unit online. Select a frequency or type your query below to begin session.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isImageMode, setIsImageMode] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchUserChats(currentUser.uid);
      }
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  const fetchUserChats = async (userId) => {
    try {
      const q = query(collection(db, 'chats'), where('userId', '==', userId));
      const querySnapshot = await getDocs(q);
      const userChats = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setChats(userChats);
    } catch (err) {
      console.error('Error fetching chats:', err);
    }
  };

  const startNewChat = () => {
    setCurrentChatId(null);
    setSelectedMedia(null);
    setMediaType(null);
    setMessages([
      { role: 'assistant', content: 'Radar AI tactical intelligence unit online. Select a frequency or type your query below to begin session.' }
    ]);
  };

  const selectChat = async (chatId) => {
    setCurrentChatId(chatId);
    setSelectedMedia(null);
    setMediaType(null);
    try {
      const chatDocRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatDocRef);
      if (chatSnap.exists()) {
        setMessages(chatSnap.data().messages || []);
      }
    } catch (err) {
      console.error('Error loading chat session:', err);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    setMediaType(isVideo ? 'video' : 'image');
    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedMedia(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  if (authChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-100 font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!input.trim() && !selectedMedia) || loading) return;

    const userPrompt = input;
    const userMessage = { 
      role: 'user', 
      content: userPrompt, 
      mediaUrl: selectedMedia,
      mediaType: mediaType
    };
    
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    const attachedMedia = selectedMedia;
    const attachedMediaType = mediaType;
    setSelectedMedia(null);
    setMediaType(null);
    setLoading(true);

    const initialLoadingText = attachedMediaType === 'video' 
      ? '📡 Scanning video data stream across tactical bandwidth...' 
      : '...';

    setMessages(prev => [...prev, { role: 'assistant', content: initialLoadingText }]);

    try {
      const token = await user.getIdToken();

      if (isImageMode) {
        setMessages(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = { role: 'assistant', content: '🎨 Synthesizing requested visual asset vectors...' };
          return newHistory;
        });

        const response = await fetch(`${BACKEND_URL}/api/generate-image`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ prompt: userPrompt }),
        });

        const data = await response.json();
        if (response.ok && data.imageUrl) {
          const finalMessages = [...updatedMessages, { 
            role: 'assistant', 
            content: `Synthesized image asset for query: "${userPrompt}"`,
            imageUrl: data.imageUrl 
          }];

          setMessages(finalMessages);

          if (!currentChatId) {
            const title = userPrompt.slice(0, 32) + '...';
            const docRef = await addDoc(collection(db, 'chats'), {
              userId: user.uid,
              title: title,
              messages: finalMessages,
              createdAt: serverTimestamp()
            });
            setCurrentChatId(docRef.id);
            fetchUserChats(user.uid);
          } else {
            const chatRef = doc(db, 'chats', currentChatId);
            await updateDoc(chatRef, { messages: finalMessages });
          }
        } else {
          throw new Error(data.error || 'Failed to synthesize image');
        }

      } else {
        updatedMessages[updatedMessages.length - 1].mediaUrl = attachedMedia;

        const response = await fetch(`${BACKEND_URL}/api/chat`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ messages: updatedMessages }),
        });

        if (!response.ok) throw new Error('Server connection stream failed');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = '';
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') break;

              const data = JSON.parse(dataStr);
              if (data.error) {
                accumulatedText = `⚠️ Error: ${data.error}`;
              } else if (data.text) {
                accumulatedText += data.text;
              }

              setMessages(prev => {
                const newHistory = [...prev];
                newHistory[newHistory.length - 1].content = accumulatedText;
                return newHistory;
              });
            }
          }
        }

        const finalMessages = [...updatedMessages, { role: 'assistant', content: accumulatedText }];
        if (!currentChatId) {
          const title = (userPrompt || 'Multimodal Scan').slice(0, 32) + '...';
          const docRef = await addDoc(collection(db, 'chats'), {
            userId: user.uid,
            title: title,
            messages: finalMessages,
            createdAt: serverTimestamp()
          });
          setCurrentChatId(docRef.id);
          fetchUserChats(user.uid);
        } else {
          const chatRef = doc(db, 'chats', currentChatId);
          await updateDoc(chatRef, { messages: finalMessages });
        }
      }

    } catch (error) {
      console.error('Request processing error:', error);
      setMessages(prev => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1].content = `⚠️ Transmission stream error: ${error.message}`;
        return newHistory;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#131314] text-[#e3e3e3] font-sans overflow-hidden">
      
      {/* SIDEBAR (ChatGPT / Gemini Style) */}
      <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 bg-[#1e1f20] border-r border-[#2df8c2]/10 flex flex-col overflow-hidden`}>
        <div className="p-3 border-b border-[#2df8c2]/10 flex items-center justify-between">
          <button 
            onClick={startNewChat}
            className="w-full flex items-center gap-3 bg-[#282a2c] hover:bg-[#333538] text-[#e3e3e3] font-medium py-2.5 px-3 rounded-full text-xs transition-all border border-white/5 shadow-sm"
          >
            <Plus className="w-4 h-4 text-[#2df8c2]" /> 
            <span>New chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
          <p className="px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Frequencies</p>
          {chats.map(chat => (
            <button
              key={chat.id}
              onClick={() => selectChat(chat.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs text-left transition-colors truncate ${
                currentChatId === chat.id ? 'bg-[#282a2c] text-[#2df8c2] font-medium border border-[#2df8c2]/20' : 'text-gray-300 hover:bg-[#1a1b1c]'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
              <span className="truncate">{chat.title}</span>
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-[#2df8c2]/10 flex items-center justify-between bg-[#171717]">
          <div className="flex items-center gap-2 truncate">
            <div className="w-7 h-7 rounded-full bg-[#2df8c2]/20 flex items-center justify-center text-[#2df8c2] font-bold text-xs">
              {user.email ? user.email[0].toUpperCase() : 'U'}
            </div>
            <span className="text-xs text-gray-300 truncate max-w-[130px]">{user.email}</span>
          </div>
          <button
            onClick={() => signOut(auth)}
            title="Sign out"
            className="p-2 hover:bg-[#282a2c] text-gray-400 hover:text-red-400 rounded-lg transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* MAIN CHAT CANVAS */}
      <div className="flex-1 flex flex-col bg-[#131314] relative">
        
        {/* TOP NAVBAR */}
        <header className="flex items-center justify-between px-4 py-3 bg-[#131314]/80 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-[#282a2c] text-gray-300 rounded-lg transition-all"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-[#2df8c2] to-cyan-400">
                Radar AI
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2df8c2]/10 text-[#2df8c2] border border-[#2df8c2]/20">v2.5 Tactical</span>
            </div>
          </div>
        </header>

        {/* CHAT MESSAGES STREAM CONTAINER */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 max-w-4xl w-full mx-auto">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex items-start gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2df8c2] to-cyan-600 flex items-center justify-center shrink-0 shadow-md text-gray-950 font-black">
                  <Sparkles className="w-4 h-4" />
                </div>
              )}

              <div className={`max-w-[80%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-[#282a2c] text-gray-100 rounded-tr-sm border border-white/5' 
                  : 'bg-[#1e1f20] text-gray-200 rounded-tl-sm border border-[#2df8c2]/10 shadow-sm'
              }`}>
                {msg.mediaUrl && (
                  msg.mediaType === 'video' || msg.mediaUrl.startsWith('data:video') ? (
                    <video controls className="rounded-xl mb-3 max-w-full h-auto border border-gray-700 shadow-md max-h-64">
                      <source src={msg.mediaUrl} />
                      Your browser does not support video preview.
                    </video>
                  ) : (
                    <img src={msg.mediaUrl} alt="Uploaded feed" className="rounded-xl mb-3 max-w-full h-auto border border-gray-700 shadow-md max-h-64 object-cover" />
                  )
                )}
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="Generated Vector Asset" className="rounded-xl mb-3 max-w-full h-auto border border-gray-700 shadow-md max-h-72 object-cover" />
                )}
                <p className="whitespace-pre-wrap font-sans">{msg.content || (loading && idx === messages.length - 1 ? '...' : '')}</p>
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center shrink-0 shadow-md text-white">
                  <User className="w-4 h-4" />
                </div>
              )}

            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* BOTTOM INPUT BAR (Gemini/ChatGPT Style) */}
        <div className="p-4 bg-[#131314] max-w-3xl w-full mx-auto">
          {selectedMedia && (
            <div className="flex items-center gap-2 bg-[#1e1f20] p-2 rounded-xl w-fit border border-[#2df8c2]/20 mb-2">
              {mediaType === 'video' ? (
                <video src={selectedMedia} className="w-10 h-10 object-cover rounded-lg" />
              ) : (
                <img src={selectedMedia} alt="Preview" className="w-10 h-10 object-cover rounded-lg" />
              )}
              <span className="text-xs text-gray-300">File attached successfully</span>
              <button 
                type="button" 
                onClick={() => setSelectedMedia(null)}
                className="text-gray-400 hover:text-red-400 text-xs px-2"
              >
                ✕
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col bg-[#1e1f20] border border-[#2df8c2]/20 rounded-3xl p-3 focus-within:border-[#2df8c2] transition-colors shadow-lg">
            
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={isImageMode ? "Describe the image asset you want to synthesize..." : "Ask Radar AI or type a prompt..."}
              rows={1}
              className="w-full bg-transparent px-3 py-1 text-gray-100 placeholder-gray-500 focus:outline-none resize-none text-sm max-h-32"
            />

            <div className="flex items-center justify-between pt-2 mt-2 border-t border-white/5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImageMode(!isImageMode)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                    isImageMode ? 'bg-purple-600 text-white shadow-md' : 'bg-[#282a2c] text-gray-300 hover:bg-[#333538]'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>{isImageMode ? 'Image Mode Active' : 'Image Generation'}</span>
                </button>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  accept="image/*,video/*" 
                  className="hidden" 
                />
                
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 bg-[#282a2c] hover:bg-[#333538] text-gray-300 rounded-full transition-all"
                  title="Attach image or video"
                >
                  📎
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || (!input.trim() && !selectedMedia)}
                className="p-2.5 bg-[#2df8c2] hover:bg-[#22cb9d] disabled:opacity-30 text-gray-950 font-bold rounded-full transition-all shadow-md"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>

          </form>
          <div className="text-center mt-2">
            <span className="text-[10px] text-gray-500">Radar AI can make mistakes. Verify critical telemetry data.</span>
          </div>
        </div>

      </div>
    </div>
  );
}