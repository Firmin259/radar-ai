// eslint-disable-next-line no-unused-vars
import React, { useState, useRef, useEffect } from 'react';
import { Send, Radio, User, Loader2, LogOut, Plus, MessageSquare, Menu, Compass } from 'lucide-react';
import { auth, db, signOut } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import Login from './Login';

// Strict URL sanitization preventing relative pathing prepends
const rawUrl = import.meta.env.VITE_BACKEND_URL || 'https://radar-ai-backend.onrender.com';
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
    { role: 'assistant', content: 'Radar AI online. Frequency locked. How can I scan or assist your workflow today?' }
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
      }));
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
      { role: 'assistant', content: 'Radar AI online. Frequency locked. How can I scan or assist your workflow today?' }
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
      console.error('Error loading chat:', err);
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
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-100 font-mono">
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
      ? '📡 Scanning video frames across frequency spectrum...' 
      : '...';

    setMessages(prev => [...prev, { role: 'assistant', content: initialLoadingText }]);

    try {
      const token = await user.getIdToken();

      if (isImageMode) {
        setMessages(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = { role: 'assistant', content: '🎨 Synthesizing visual asset vectors...' };
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
            content: `Synthesized image asset for prompt: "${userPrompt}"`,
            imageUrl: data.imageUrl 
          }];

          setMessages(finalMessages);

          if (!currentChatId) {
            const title = userPrompt.slice(0, 30) + '...';
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
          throw new Error(data.error || 'Failed to generate image');
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

        if (!response.ok) throw new Error('Server connection failed');

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
          const title = (userPrompt || 'Media Scan').slice(0, 30) + '...';
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
        newHistory[newHistory.length - 1].content = `⚠️ Signal transmission failed: ${error.message}`;
        return newHistory;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-mono">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden`}>
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <button 
            onClick={startNewChat}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-md tracking-wider"
          >
            <Plus className="w-4 h-4" /> NEW SCAN FREQUENCY
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Logged Frequencies</p>
          {chats.map(chat => (
            <button
              key={chat.id}
              onClick={() => selectChat(chat.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-left transition-colors truncate ${
                currentChatId === chat.id ? 'bg-slate-800 text-emerald-400 font-medium' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0 text-emerald-500" />
              <span className="truncate">{chat.title}</span>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <div className="truncate text-[11px] text-slate-400">
            <p className="font-medium text-slate-200 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => signOut(auth)}
            title="Disconnect Signal"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col bg-slate-900">
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-600/20 border border-emerald-500/40 rounded-xl text-emerald-400">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h1 className="font-black text-sm tracking-wider text-slate-100">RADAR AI</h1>
                <p className="text-[10px] text-emerald-400 tracking-widest uppercase">Tactical Intelligence Unit</p>
              </div>
            </div>
          </div>
        </header>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex items-start gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' ? 'bg-cyan-600 text-white' : 'bg-emerald-600 text-slate-950 font-bold'
              }`}>
                {msg.role === 'user' ? <User className="w-5 h-5" /> : <Compass className="w-5 h-5" />}
              </div>
              
              <div className={`max-w-[75%] rounded-2xl px-5 py-3.5 text-xs leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-cyan-600/20 border border-cyan-500/30 text-slate-100 rounded-tr-none' 
                  : 'bg-slate-800/80 border border-slate-700/50 text-slate-200 rounded-tl-none'
              }`}>
                {msg.mediaUrl && (
                  msg.mediaType === 'video' || msg.mediaUrl.startsWith('data:video') ? (
                    <video controls className="rounded-xl mb-3 max-w-full h-auto border border-slate-700 shadow-md max-h-64">
                      <source src={msg.mediaUrl} />
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <img src={msg.mediaUrl} alt="Uploaded feed" className="rounded-xl mb-3 max-w-full h-auto border border-slate-700 shadow-md max-h-64 object-cover" />
                  )
                )}

                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="Generated Vector Asset" className="rounded-xl mb-3 max-w-full h-auto border border-slate-700 shadow-md max-h-64 object-cover" />
                )}

                <p className="whitespace-pre-wrap">{msg.content || (loading && idx === messages.length - 1 ? '...' : '')}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Input Area */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex flex-col gap-2">
          {selectedMedia && (
            <div className="flex items-center gap-2 bg-slate-800/80 p-2 rounded-xl w-fit border border-slate-700">
              {mediaType === 'video' ? (
                <video src={selectedMedia} className="w-10 h-10 object-cover rounded-lg" />
              ) : (
                <img src={selectedMedia} alt="Preview" className="w-10 h-10 object-cover rounded-lg" />
              )}
              <span className="text-[10px] text-slate-300">{mediaType === 'video' ? 'Video feed attached' : 'Image feed attached'}</span>
              <button 
                type="button" 
                onClick={() => setSelectedMedia(null)}
                className="text-slate-400 hover:text-red-400 text-xs px-2"
              >
                ✕
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-2xl p-2 focus-within:border-emerald-500 transition-colors">
            <button
              type="button"
              onClick={() => setIsImageMode(!isImageMode)}
              title={isImageMode ? "Switch to Tactical Chat Mode" : "Switch to Visual Synthesis Mode"}
              className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center gap-1 shrink-0 ${
                isImageMode ? 'bg-purple-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              🎨 {isImageMode ? 'Vector Mode' : 'Chat Mode'}
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
              title="Upload Media Feed"
              className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl transition-all shrink-0"
            >
              📎
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isImageMode ? "Describe visual vector..." : "Enter frequency prompt or query attached media..."}
              className="flex-1 bg-transparent px-4 py-2 text-slate-100 placeholder-slate-400 focus:outline-none text-xs"
            />
            
            <button
              type="submit"
              disabled={loading || (!input.trim() && !selectedMedia)}
              className="p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 text-slate-950 font-bold rounded-xl transition-all shadow-md shrink-0"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}