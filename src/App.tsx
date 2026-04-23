import React, { useState, useRef, useEffect } from 'react';
import {
  Menu, User, Lock, Trophy, Gamepad2, Ticket, Clock,
  Upload, CheckCircle, Home as HomeIcon, BarChart3, ReceiptText, 
  CircleUserRound, ShieldBan, FileImage, ShieldCheck, BadgeCheck, AlertCircle, Check, LogOut, Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { collection, addDoc, onSnapshot, query, where, updateDoc, doc, getDoc, serverTimestamp, orderBy } from 'firebase/firestore';

type Screen = 'home' | 'payment' | 'success' | 'admin_dashboard' | 'orders' | 'admin_login';

interface Order {
  id: string;
  displayId: string;
  status: 'pending' | 'approved' | 'expired';
  text: string;
  code?: string;
  senderNumber?: string;
  fileName?: string;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedPrediction, setSelectedPrediction] = useState<'cumulative' | 'individual' | null>(null);
  
  // Auth State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLocalAdmin, setIsLocalAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Payment State
  const [senderNumber, setSenderNumber] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admin State
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if admin
        const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
        setIsAdmin(adminDoc.exists() || currentUser.email === 'ahmedslman787878@gmail.com');
      } else {
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user && !isLocalAdmin) {
      setOrders([]);
      return;
    }

    const ordersRef = collection(db, 'orders');
    let q;
    
    if (isAdmin || isLocalAdmin) {
      q = query(ordersRef, orderBy('createdAt', 'desc'));
    } else if (user) {
      q = query(ordersRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    } else {
      return;
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(fetchedOrders);
    }, (error) => {
      console.error("Firestore error:", error);
    });

    return () => unsubscribe();
  }, [user, isAdmin, isLocalAdmin]);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  const handleSignOut = () => {
    signOut(auth);
    setCurrentScreen('home');
  };

  const handlePredictionClick = (type: 'cumulative' | 'individual') => {
    if (!user) {
      alert('يجب تسجيل الدخول أولاً');
      return;
    }
    setSelectedPrediction(type);
    setCurrentScreen('payment');
    setSenderNumber('');
    setFileName('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileName(e.target.files[0].name);
    }
  };

  const handlePaymentSubmit = async () => {
    if (!senderNumber || !fileName) {
      alert('يرجى إدخال رقم المرسل ورفع صورة الإيصال.');
      return;
    }
    if (!user) return;

    setCurrentScreen('success');
    
    try {
      await addDoc(collection(db, 'orders'), {
        userId: user.uid,
        displayId: `طلب #${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'pending',
        text: 'قيد المراجعة',
        senderNumber,
        fileName,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Error adding document: ", e);
      alert("حدث خطأ أثناء الإرسال");
    }
  };

  const handleApproveOrder = async (id: string) => {
    const codeToAssign = codeInputs[id];
    if (!codeToAssign || codeToAssign.trim() === '') {
      alert('يجب إدخال كود القسيمة أولاً قبل الموافقة.');
      return;
    }
    try {
      await updateDoc(doc(db, 'orders', id), {
        status: 'approved',
        text: 'تم القبول',
        code: codeToAssign,
        updatedAt: serverTimestamp()
      });
      alert('تم قبول الطلب بنجاح');
    } catch(e: any) {
      console.error(e);
      alert('حدث خطأ أثناء القبول: ' + (e.message || ''));
    }
  };

  const handleDeclineOrder = async (id: string) => {
    try {
      await updateDoc(doc(db, 'orders', id), {
        status: 'expired',
        text: 'مرفوض',
        updatedAt: serverTimestamp()
      });
      alert('تم رفض الطلب');
    } catch(e: any) {
      console.error(e);
      alert('حدث خطأ أثناء الرفض: ' + (e.message || ''));
    }
  };

  const handleAdminLogin = () => {
    if (adminPassword === 'ahmed787878') {
      setAdminError('');
      setIsLocalAdmin(true);
      setCurrentScreen('admin_dashboard');
      setAdminPassword('');
    } else {
      setAdminError('كلمة المرور غير صحيحة');
    }
  };

  const currentNav = currentScreen === 'orders' ? 'orders' : currentScreen === 'home' || currentScreen === 'payment' || currentScreen === 'success' ? 'home' : '';

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-white font-sans flex flex-col items-center relative overflow-x-hidden">
      {/* Background Graphic Lines */}
      <div className="absolute inset-0 opacity-10 pointer-events-none flex items-center justify-center overflow-hidden">
        <div className="w-[800px] h-[800px] rounded-full border border-emerald-500 opacity-20 absolute -top-40"></div>
        <div className="w-[600px] h-[600px] rounded-full border border-cyan-500 opacity-20 absolute -top-20"></div>
        <div className="w-[400px] h-[400px] rounded-full border border-emerald-400 opacity-30 absolute top-0"></div>
      </div>

      <div className="w-full max-w-md min-h-[100dvh] flex flex-col relative z-10 bg-slate-950 sm:border-x sm:border-slate-800 shadow-2xl">
        
        {/* HEADER */}
        <header className="flex items-center justify-between px-4 py-4 bg-slate-950 shadow-[0_4px_20px_rgba(0,0,0,0.5)] border-b border-amber-500/20 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-slate-800/80 rounded-lg transition-colors text-amber-500/80 hover:text-amber-400">
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-2" onClick={() => setCurrentScreen('home')}>
              <div className="w-10 h-10 bg-gradient-to-tr from-amber-400 to-amber-600 rounded-lg flex items-center justify-center p-1.5 shadow-lg shadow-amber-500/20">
                <svg className="w-full h-full text-slate-950" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16z"/>
                  <path d="M12 6.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-3 2.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-3 4.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-4.5-1a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm9 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
                </svg>
              </div>
              <div className="font-bold leading-tight cursor-pointer">
                <div className="text-lg font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">توقعات المباريات</div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentScreen('admin_login')}
              className="flex items-center justify-center p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 rounded-full text-amber-500 transition-colors shrink-0"
              title="دخول المشرف (بالدبوس)"
            >
              <Lock size={16} />
            </button>
            
            {isAdmin && (
               <button 
                onClick={() => setCurrentScreen('admin_dashboard')}
                className="flex items-center justify-center p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 rounded-full text-amber-500 transition-colors shrink-0"
                title="لوحة التحكم"
              >
                <ShieldCheck size={18} />
              </button>
            )}

            {!user ? (
               <button onClick={handleSignIn} className="flex items-center gap-1.5 bg-white hover:bg-gray-100 text-slate-900 shadow-lg px-2.5 py-1.5 rounded-full transition-all shrink-0 hover:scale-[1.02] active:scale-95 border border-amber-500/20">
                 <svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                   <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                   <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                   <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                   <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
                 </svg>
                 <span className="text-[11px] font-black tracking-tight" style={{ paddingTop: '1px' }}>دخول</span>
               </button>
            ) : (
               <button onClick={handleSignOut} className="flex items-center gap-1.5 p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 rounded-full text-amber-500 transition-colors shrink-0">
                 <LogOut size={16} />
               </button>
            )}
          </div>
        </header>

        {/* MAIN SCROLLABLE CONTENT */}
        <main className="flex-1 overflow-y-auto w-full relative z-10 scrollbar-hide py-4">
          <AnimatePresence mode="wait">
            
            {/* --- HOME SCREEN --- */}
            {currentScreen === 'home' && (
              <motion.div 
                key="home"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col gap-6 p-4"
              >
                {/* Hero Title */}
                <div className="group relative w-full mb-2">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-[2rem] opacity-20 blur-lg transition duration-500 group-hover:opacity-30"></div>
                  <div className="relative bg-slate-900/80 backdrop-blur-sm border border-amber-500/30 p-6 sm:p-8 rounded-[2rem] text-center overflow-hidden flex flex-col items-center shadow-2xl">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 blur-3xl rounded-full translate-x-1/4 -translate-y-1/4"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-600/10 blur-3xl rounded-full -translate-x-1/4 translate-y-1/4"></div>

                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold px-3 py-1.5 rounded-full mb-4 flex items-center gap-1.5 backdrop-blur-md">
                      <BadgeCheck size={14} className="text-amber-400" />
                      <span>دقة تحليل احترافية</span>
                    </div>

                    <h1 className="text-2xl sm:text-3xl font-black leading-tight text-white relative z-10 mb-3">
                      احصل على <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500">توقع المباريات الأفضل</span>
                    </h1>
                    
                    <p className="text-slate-400 text-xs sm:text-sm leading-relaxed relative z-10 mx-auto max-w-[95%]">
                      من خلال نخبة مختارة من أفضل المحللين الرياضيين على مستوى عالٍ لضمان تفوقك.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 w-full">
                  <button 
                    onClick={() => handlePredictionClick('cumulative')}
                    className="flex-1 group relative overflow-hidden bg-gradient-to-bl from-slate-800 to-slate-900 border-2 border-amber-500/40 hover:border-amber-400 rounded-3xl cursor-pointer transition-all duration-300 shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:-translate-y-1 flex flex-col items-center text-center p-4"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-2xl rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-amber-500/20 transition-all"></div>
                    
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30 mb-3 relative z-10 mx-auto">
                      <Trophy className="text-amber-50" size={24} />
                    </div>
                    
                    <h2 className="text-base font-black mb-1 text-transparent bg-clip-text bg-gradient-to-l from-white to-slate-300 relative z-10">التوقع التراكمي</h2>
                    <p className="text-slate-400 text-[10px] leading-relaxed relative z-10 mt-auto">
                      اربح أضعاف عبر توقع نتائج عدة مباريات.
                    </p>
                  </button>

                  <button 
                    onClick={() => handlePredictionClick('individual')}
                    className="flex-1 group relative overflow-hidden bg-gradient-to-bl from-slate-800 to-slate-900 border-2 border-amber-500/40 hover:border-amber-400 rounded-3xl cursor-pointer transition-all duration-300 shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:-translate-y-1 flex flex-col items-center text-center p-4"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-2xl rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-amber-500/20 transition-all"></div>
                    
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30 mb-3 relative z-10 mx-auto">
                      <Gamepad2 className="text-amber-50" size={24} />
                    </div>
                    
                    <h2 className="text-base font-black mb-1 text-transparent bg-clip-text bg-gradient-to-l from-white to-slate-300 relative z-10">التوقع الفردي</h2>
                    <p className="text-slate-400 text-[10px] leading-relaxed relative z-10 mt-auto">
                      توقع نتيجة مباراة واحدة بدقة.
                    </p>
                  </button>
                </div>
                
                <div className="mt-2 text-center flex items-center justify-center gap-2">
                  <div className="h-px bg-slate-800 flex-1"></div>
                  <span className="text-amber-500 font-bold text-xs bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full">
                    🇪🇬 محللين مصريين
                  </span>
                  <div className="h-px bg-slate-800 flex-1"></div>
                </div>
              </motion.div>
            )}

            {/* --- PAYMENT SCREEN --- */}
            {currentScreen === 'payment' && (
              <motion.div 
                key="payment"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4"
              >
                <div className="bg-slate-900 rounded-[2.5rem] border border-slate-800 shadow-2xl flex flex-col p-6">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h2 className="text-2xl font-black mb-1">إتمام الدفع</h2>
                      <p className="text-sm text-slate-400">لتفعيل {selectedPrediction === 'cumulative' ? 'التوقع التراكمي' : 'التوقع الفردي'}</p>
                    </div>
                    <div className="bg-emerald-500 text-slate-950 px-3 py-2 rounded-2xl flex flex-col items-center">
                      <span className="text-[10px] font-bold opacity-80">المبلغ</span>
                      <span className="text-lg font-black">100 ج</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-6">
                    <div className="bg-slate-950 p-4 rounded-3xl border border-slate-800">
                      <p className="text-xs text-slate-500 mb-2">رقم التحويل (محفظة الكترونية)</p>
                      <div className="flex items-center justify-between bg-slate-900 rounded-2xl p-2 border border-slate-800/50">
                        <div className="text-xl sm:text-2xl font-mono font-bold text-center text-emerald-400 tracking-wider flex-1 pl-2">
                          01080379299
                        </div>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText('01080379299');
                            alert('تم النسخ بنجاح');
                          }}
                          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl transition-colors shrink-0"
                          title="نسخ الرقم"
                        >
                          <span className="text-xs font-bold">نسخ</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-bold text-slate-300">أدخل الرقم المحول منه:</label>
                      <input 
                        type="tel" 
                        value={senderNumber}
                        onChange={(e) => setSenderNumber(e.target.value)}
                        placeholder="01xxxxxxxxx"
                        dir="ltr"
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-emerald-400 placeholder:text-slate-700 focus:outline-none focus:border-emerald-500 tracking-widest text-center"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-bold text-slate-300">إثبات الدفع (إسكرين شوت):</label>
                      <div className="mt-1">
                        <input 
                          type="file" 
                          accept="image/*" 
                          ref={fileInputRef} 
                          onChange={handleFileUpload} 
                          className="hidden" 
                        />
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className={`w-full bg-slate-950 border-2 ${fileName ? 'border-emerald-500' : 'border-dashed border-slate-800'} rounded-2xl p-4 flex items-center justify-center gap-3 text-slate-500 cursor-pointer hover:border-emerald-500/50 transition-colors`}
                        >
                          <Upload size={20} className={fileName ? "text-emerald-500" : ""} />
                          <span className="text-sm">{fileName ? fileName : 'رفع صورة الإيصال'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="bg-cyan-500/5 border border-cyan-500/20 p-4 rounded-2xl flex gap-3 text-sm text-cyan-200/80 leading-relaxed items-start">
                       <AlertCircle size={18} className="text-cyan-500 shrink-0 mt-0.5" />
                       <p>بعد التأكيد ستتم المراجعة وسيتم إرسال كود القسيمة إلى قسم <span className="font-bold text-white underline decoration-cyan-500">طلباتي</span>.</p>
                    </div>

                    <button 
                      onClick={handlePaymentSubmit}
                      className="w-full mt-2 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-black text-xl rounded-2xl shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-transform"
                    >
                      تأكيد الدفع
                    </button>
                  </div>
                </div>
                
                <button 
                  onClick={() => setCurrentScreen('home')}
                  className="mt-6 w-full text-sm text-slate-500 text-center hover:text-white"
                >
                  العودة للرئيسية
                </button>
              </motion.div>
            )}

            {/* --- SUCCESS / WAITING SCREEN --- */}
            {currentScreen === 'success' && (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 flex flex-col items-center justify-center text-center h-full min-h-[400px]"
              >
                <div className="w-24 h-24 bg-emerald-500/10 rounded-3xl flex items-center justify-center mb-6 border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                  <BadgeCheck size={50} className="text-emerald-400" />
                </div>
                <h2 className="text-3xl font-black mb-4 text-white">تم استلام طلبك!</h2>
                <p className="text-lg text-slate-300 mb-8 leading-relaxed max-w-[280px]">
                  جاري مراجعة عملية الدفع. <br/> 
                  سيتم إرسال الكود قريباً وتجده في <span className="font-bold text-emerald-400">طلباتي</span>.
                </p>
                <button 
                  onClick={() => setCurrentScreen('orders')}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-3 rounded-2xl font-bold text-lg shadow-lg flex items-center gap-2 transition-all active:scale-95 border border-slate-700"
                >
                  الذهاب إلى طلباتي
                  <ReceiptText size={20} className="text-emerald-400" />
                </button>
              </motion.div>
            )}

            {/* --- ADMIN LOGIN SCREEN --- */}
            {currentScreen === 'admin_login' && (
              <motion.div 
                key="admin_login"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-6"
              >
                <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center">
                  <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-6 text-cyan-400 border border-cyan-500/20">
                    <ShieldBan size={32} />
                  </div>
                  <h2 className="text-2xl font-black mb-8 text-white text-center">دخول المشرف</h2>
                  
                  <div className="w-full relative">
                    <Lock size={20} className="absolute right-4 top-4 text-slate-500" />
                    <input 
                       type="password"
                       value={adminPassword}
                       onChange={(e) => setAdminPassword(e.target.value)}
                       placeholder="كلمة المرور"
                       dir="ltr"
                       className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pr-12 pl-4 text-white focus:outline-none focus:border-cyan-500 text-center font-mono text-lg placeholder:text-slate-700 tracking-widest"
                    />
                  </div>
                  
                  {adminError && <p className="text-red-400 text-sm mt-3 w-full text-center">{adminError}</p>}
                  
                  <button 
                    onClick={handleAdminLogin}
                    className="w-full bg-gradient-to-r from-slate-800 to-slate-700 text-white font-black py-4 rounded-2xl mt-8 transition-all hover:border-cyan-500 border border-slate-700 shadow-xl"
                  >
                    دخول
                  </button>
                  <button 
                    onClick={() => {
                        setCurrentScreen('home');
                        setAdminError('');
                    }}
                    className="mt-6 text-slate-500 hover:text-white text-sm pb-2"
                  >
                    إلغاء والعودة
                  </button>
                </div>
              </motion.div>
            )}

            {/* --- ADMIN DASHBOARD --- */}
            {currentScreen === 'admin_dashboard' && (isAdmin || isLocalAdmin) && (
              <motion.div 
                key="admin_dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4"
              >
                 <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
                    <h2 className="text-2xl font-black flex items-center gap-2 text-cyan-400">
                        <ShieldCheck size={28} />
                        لوحة التحكم
                    </h2>
                    <button onClick={() => {
                        setIsLocalAdmin(false);
                        setCurrentScreen('home');
                    }} className="text-sm bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl hover:bg-slate-800">
                        خروج
                    </button>
                 </div>
                 
                 <div className="space-y-4">
                   <h3 className="text-lg font-bold">الطلبات قيد المراجعة:</h3>
                   {orders.filter(o => o.status === 'pending').length === 0 && (
                     <p className="text-slate-500 text-sm bg-slate-900 p-4 rounded-2xl text-center">لا توجد طلبات جديدة.</p>
                   )}
                   {orders.filter(o => o.status === 'pending').map((order) => (
                     <div key={order.id} className="bg-slate-900 rounded-[2rem] p-5 border border-slate-800 shadow-lg flex flex-col gap-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-bold text-emerald-400">{order.displayId}</span>
                          <span className="text-slate-400 text-xs">{order.fileName}</span>
                        </div>
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center font-mono break-all font-bold tracking-widest text-lg">
                          {order.senderNumber}
                        </div>
                        <div className="flex flex-col gap-2 mt-2">
                          <input 
                            type="text" 
                            placeholder="أدخل كود الموافقة"
                            className="bg-slate-950 border border-slate-800 p-2 text-sm rounded-lg text-center focus:border-cyan-500 outline-none"
                            value={codeInputs[order.id] || ''}
                            onChange={(e) => setCodeInputs({...codeInputs, [order.id]: e.target.value})}
                          />
                          <div className="flex gap-2">
                            <button onClick={() => handleApproveOrder(order.id)} className="flex-1 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 py-2 rounded-xl text-sm font-bold">قبول الطلب</button>
                            <button onClick={() => handleDeclineOrder(order.id)} className="flex-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 py-2 rounded-xl text-sm font-bold">رفض</button>
                          </div>
                        </div>
                     </div>
                   ))}
                 </div>

                 <div className="mt-8 space-y-4">
                   <h3 className="text-lg font-bold text-slate-400">الطلبات المكتملة:</h3>
                   {orders.filter(o => o.status !== 'pending').map((order) => (
                     <div key={order.id} className="bg-slate-900/50 rounded-2xl p-4 border border-slate-800/50 flex justify-between items-center opacity-70">
                       <span>{order.displayId}</span>
                       <span className={`text-xs px-2 py-1 rounded-full ${order.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                         {order.text}
                       </span>
                     </div>
                   ))}
                 </div>
              </motion.div>
            )}

            {/* --- ORDERS SCREEN --- */}
            {currentScreen === 'orders' && (
              <motion.div 
                key="orders"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6 pt-8"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-black flex items-center gap-3">
                    <div className="bg-emerald-500/10 p-2 rounded-xl text-emerald-400">
                      <ReceiptText size={24} />
                    </div>
                    طلباتي
                  </h2>
                </div>
                
                <div className="flex flex-col gap-4">
                  {orders.map((order) => (
                    <div key={order.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg flex flex-col gap-3 relative overflow-hidden text-right">
                      {/* Status indicator line */}
                      <div className={`absolute right-0 top-0 bottom-0 w-1 ${
                        order.status === 'pending' ? 'bg-cyan-500' : 
                        order.status === 'approved' ? 'bg-emerald-500' : 
                        'bg-slate-600'
                      }`}></div>

                      <div className="flex justify-between items-center pr-2">
                        <span className="text-sm font-bold text-slate-300">{order.displayId}</span>
                        <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg border ${
                          order.status === 'pending' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 
                          order.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                          'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                          {order.text}
                          {order.status === 'pending' && <Clock size={14} />}
                          {order.status === 'approved' && <CheckCircle size={14} />}
                        </div>
                      </div>

                      {order.status === 'approved' && order.code && (
                        <div className="mt-2 bg-slate-950 border border-emerald-500/30 rounded-2xl p-4 flex flex-col items-center gap-2">
                           <span className="text-xs text-emerald-400 font-bold">كود القسيمة الخاص بك:</span>
                           <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800 w-full justify-between">
                             <span className="font-mono text-xl font-black tracking-widest text-white selection:bg-emerald-500 selection:text-black pl-2">
                               {order.code}
                             </span>
                             <button 
                               onClick={() => {
                                 navigator.clipboard.writeText(order.code!);
                                 setCopiedId(order.id);
                                 setTimeout(() => setCopiedId(null), 2000);
                               }}
                               className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-emerald-400 transition-colors shrink-0"
                               title="نسخ الكود"
                             >
                               {copiedId === order.id ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                             </button>
                           </div>
                        </div>
                      )}

                      {order.status === 'pending' && (
                        <div className="mt-2 bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col items-center gap-2">
                           <span className="text-xs text-slate-500 font-bold">جاري المراجعة</span>
                           <div className="animate-pulse flex gap-1">
                             <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                             <div className="w-2 h-2 bg-cyan-500 rounded-full animation-delay-200"></div>
                             <div className="w-2 h-2 bg-cyan-500 rounded-full animation-delay-400"></div>
                           </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>

        {/* BOTTOM NAVIGATION */}
        <div className="shrink-0 relative">
          
          <nav className="bg-slate-950 shadow-[0_-4px_20px_rgba(0,0,0,0.5)] border-t border-amber-500/20 h-16 w-full z-20 flex justify-around items-center px-2 pb-safe relative">
            <NavButton 
              icon={<ReceiptText size={22} />} 
              label="طلباتي" 
              isActive={currentNav === 'orders'} 
              onClick={() => setCurrentScreen('orders')}
            />
            
            <NavButton 
              icon={<HomeIcon size={22} />} 
              label="الرئيسية" 
              isActive={currentNav === 'home'} 
              onClick={() => setCurrentScreen('home')} 
            />

            <NavButton 
              icon={<User size={22} />} 
              label="أنا" 
              isActive={currentScreen === 'admin_dashboard'} 
              onClick={() => {
                 if (!user) handleSignIn();
                 else if (isAdmin) setCurrentScreen('admin_dashboard');
              }} 
            />
          </nav>
        </div>
      </div>
    </div>
  );
}

function NavButton({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center flex-1 h-full gap-1.5 transition-colors ${
        isActive ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      <div className={`${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'scale-100'} transition-transform duration-300`}>
        {icon}
      </div>
      <span className="text-[11px] font-bold">{label}</span>
      {isActive && (
        <span className="absolute bottom-0 w-12 h-1 bg-amber-500 rounded-t-full shadow-[0_0_8px_rgba(245,158,11,1)]"></span>
      )}
    </button>
  );
}


