import React, { useState, useRef, useEffect } from 'react';
import {
  Menu, User, Lock, Trophy, Gamepad2, Ticket, Clock,
  Upload, CheckCircle, Home as HomeIcon, BarChart3, ReceiptText, 
  CircleUserRound, ShieldBan, FileImage, ShieldCheck, BadgeCheck, AlertCircle, Check, LogOut, Copy, Headset,
  Briefcase, Link as LinkIcon, Wallet, Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, User as FirebaseUser } from 'firebase/auth';
import { collection, addDoc, onSnapshot, query, where, updateDoc, setDoc, doc, getDoc, serverTimestamp, orderBy, increment, getDocs } from 'firebase/firestore';

type Screen = 'home' | 'payment' | 'success' | 'admin_dashboard' | 'user_dashboard' | 'orders' | 'admin_login' | 'auth' | 'affiliate_join' | 'affiliate_dashboard';

interface Order {
  id: string;
  displayId: string;
  status: 'pending' | 'approved' | 'expired';
  text: string;
  code?: string;
  senderNumber?: string;
  fileName?: string;
  couponProvider?: string;
  userId?: string;
  affiliateId?: string | null;
  createdAt?: any;
}

interface AffiliateData {
  id: string;
  userId: string;
  name: string;
  phone: string;
  balance: number;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedPrediction, setSelectedPrediction] = useState<'cumulative' | 'individual' | null>(null);
  
  // Auth State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLocalAdmin, setIsLocalAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // getRedirectResult is removed as we now use popup exclusively
  }, []);

  // Payment State
  const [senderNumber, setSenderNumber] = useState('');
  const [fileName, setFileName] = useState('');
  const [couponProvider, setCouponProvider] = useState('1xBet');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admin State
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});

  // Affiliate State
  const [affiliateData, setAffiliateData] = useState<AffiliateData | null>(null);
  const [affiliateName, setAffiliateName] = useState('');
  const [affiliatePhone, setAffiliatePhone] = useState('');

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // Email/Password Auth State
  const [authIdentifier, setAuthIdentifier] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authView, setAuthView] = useState<'options' | 'form'>('options');

  // Track Referral
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refId = params.get('ref');
    if (refId) {
      localStorage.setItem('affiliate_ref', refId);
    }
  }, []);

  // Fetch Affiliate Data
  useEffect(() => {
    if (user && user.uid) {
      const docRef = doc(db, 'affiliates', user.uid);
      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          setAffiliateData({ id: docSnap.id, ...docSnap.data() } as AffiliateData);
        } else {
          setAffiliateData(null);
        }
      });
      return () => unsubscribe();
    } else {
      setAffiliateData(null);
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Check if admin and save user profile
        // Set admin immediately by email
        let defaultAdmin = currentUser.email === 'ahmedslman787878@gmail.com';
        setIsAdmin(defaultAdmin);
        
        try {
          const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
          if (adminDoc.exists()) {
             setIsAdmin(true);
          }
          
          const userRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userRef);
          
          const storedRefId = localStorage.getItem('affiliate_ref');

          if (!userDoc.exists()) {
            await setDoc(userRef, {
               name: currentUser.displayName || '',
               email: currentUser.email || '',
               phone: currentUser.phoneNumber || '',
               referredBy: storedRefId || null,
               lastLogin: serverTimestamp(),
               createdAt: serverTimestamp()
            });
          } else {
            // Update lastLogin, but preserve referredBy if it wasn't set and we now have one
            const currentData = userDoc.data();
            const updates: any = {
               lastLogin: serverTimestamp(),
               name: currentUser.displayName || currentData.name || '',
            };
            if (!currentData.referredBy && storedRefId) {
               updates.referredBy = storedRefId;
            }
            await updateDoc(userRef, updates);
          }
        } catch (e: any) {
          if (e.message && e.message.includes('client is offline')) {
             console.warn("Firestore is offline. Operating with limited capabilities.");
          } else {
             console.error("Error fetching admin status or saving user:", e);
          }
        }
      } else {
        setUser(null);
        setIsAdmin(false);
        localStorage.removeItem('temp_user'); // Clean up any old garbage payload
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
      q = query(ordersRef);
    } else if (user) {
      // Removing orderBy from the query to avoid needing a Firestore composite index.
      // We will sort the results in JavaScript instead.
      q = query(ordersRef, where('userId', '==', user.uid));
    } else {
      return;
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      
      // Sort in JS to avoid compound or standalone index requirements
      fetchedOrders.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });

      setOrders(fetchedOrders);
    }, (error) => {
      console.error("Firestore error:", error);
      alert("خطأ في جلب الطلبات: " + error.message);
    });

    return () => unsubscribe();
  }, [user, isAdmin, isLocalAdmin]);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setCurrentScreen('home');
      alert('تم تسجيل الدخول بنجاح');
    } catch (error: any) {
      console.error("Sign in failed:", error);
      let errorMsg = error.message;
      if (error.code === 'auth/unauthorized-domain') {
        errorMsg = 'النطاق الحالي غير مصرح له بتسجيل الدخول. تأكد من إضافة النطاق في إعدادات Firebase Authentication.';
      } else if (error.code === 'auth/popup-closed-by-user') {
        errorMsg = 'تم إغلاق نافذة تسجيل الدخول قبل اكتمال العملية.';
      } else if (error.code === 'auth/popup-blocked') {
        errorMsg = 'تم حظر النافذة المنبثقة بواسطة المتصفح. يرجى السماح بالنوافذ المنبثقة.';
      } else if (error.message.includes('Cross-Origin')) {
        errorMsg = 'حدث خطأ متعلق بـ Cross-Origin. يرجى محاولة فتح التطبيق في نافذة جديدة وليس داخل إطار (iframe).';
      }

      setAuthError('Error: ' + errorMsg);
      // Give a visual alert so it's impossible to miss on mobile.
      alert('خطأ في تسجيل الدخول:\\n' + errorMsg);
      setAuthView('options');
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('temp_user');
    signOut(auth);
    setUser(null);
    setCurrentScreen('home');
  };

  const handlePredictionClick = (type: 'cumulative' | 'individual') => {
    if (!user) {
      setShowLoginPrompt(true);
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

    try {
      const affiliateRefId = localStorage.getItem('affiliate_ref');

      await addDoc(collection(db, 'orders'), {
        userId: user.uid,
        displayId: `طلب #${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'pending',
        text: 'قيد المراجعة',
        senderNumber,
        fileName,
        couponProvider,
        affiliateId: affiliateRefId || null,
        createdAt: serverTimestamp()
      });
      
      alert('تم ارسال الطلب بنجاح');
      setCurrentScreen('orders');
    } catch (e: any) {
      console.error("Error adding document: ", e);
      alert("حدث خطأ أثناء الإرسال: " + (e.message || ''));
    }
  };

  const handleJoinAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !affiliateName || !affiliatePhone) {
      alert('الرجاء التأكد من تسجيل الدخول وإدخال جميع البيانات');
      return;
    }
    try {
      await setDoc(doc(db, 'affiliates', user.uid), {
        userId: user.uid,
        name: affiliateName,
        phone: affiliatePhone,
        balance: 0,
        createdAt: serverTimestamp()
      });
      setCurrentScreen('affiliate_dashboard');
      alert('تم التسجيل بنجاح والانضمام كشريك!');
    } catch (e: any) {
      console.error(e);
      alert('حدث خطأ أثناء الانضمام: ' + (e.message || ''));
    }
  };

  const handleApproveOrder = async (id: string) => {
    const codeToAssign = codeInputs[id];
    if (!codeToAssign || codeToAssign.trim() === '') {
      alert('يجب إدخال كود القسيمة أولاً قبل الموافقة.');
      return;
    }

    // Find if the order has an affiliate
    const orderToApprove = orders.find(o => o.id === id);

    try {
      await updateDoc(doc(db, 'orders', id), {
        status: 'approved',
        text: 'تم القبول',
        code: codeToAssign,
        updatedAt: serverTimestamp()
      });

      if (orderToApprove && orderToApprove.affiliateId) {
        try {
          const directAffDocRef = doc(db, 'affiliates', orderToApprove.affiliateId);
          const directAffDocSnap = await getDoc(directAffDocRef);
          if (directAffDocSnap.exists()) {
            await updateDoc(directAffDocRef, {
              balance: increment(25)
            });
          } else {
            // Support older affiliate docs that didn't use user.uid as doc ID
            const affQuery = query(collection(db, 'affiliates'), where('userId', '==', orderToApprove.affiliateId));
            const affSnap = await getDocs(affQuery);
            if (!affSnap.empty) {
              const affDocRef = doc(db, 'affiliates', affSnap.docs[0].id);
              await updateDoc(affDocRef, {
                balance: increment(25)
              });
            }
          }
        } catch (err) {
          console.error('Error updating affiliate balance:', err);
        }
      }

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
               <button onClick={() => setCurrentScreen('auth')} className="flex items-center gap-1.5 bg-white hover:bg-gray-100 text-slate-900 shadow-lg px-2.5 py-1.5 rounded-full transition-all shrink-0 hover:scale-[1.02] active:scale-95 border border-amber-500/20">
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

                <div className="mt-6 flex justify-center w-full">
                  <a 
                    href="https://wa.me/201080379299" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto relative group overflow-hidden bg-slate-900 border border-slate-700/50 p-4 rounded-2xl flex items-center gap-4 transition-all hover:bg-slate-800 hover:border-emerald-500/50 shadow-lg hover:shadow-emerald-500/10"
                  >
                    <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 blur-2xl rounded-full -translate-y-1/2 translate-x-1/4"></div>
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
                      <Headset size={24} />
                    </div>
                    <div className="text-right">
                      <h4 className="text-emerald-400 font-bold text-sm sm:text-base mb-0.5">خدمة العملاء والدعم</h4>
                      <p className="text-slate-300 font-medium text-[11px] sm:text-xs leading-relaxed max-w-[260px]">
                        اضغط هنا للتواصل مع خدمة العملاء في حال خسرت 2 قسيمة لاسترجاع الخسارة
                      </p>
                    </div>
                  </a>
                </div>

                <div className="mt-4 flex justify-center w-full">
                  <button 
                    onClick={async () => {
                      if (!user) {
                        setShowLoginPrompt(true);
                      } else {
                        if (!affiliateData) {
                          try {
                            await setDoc(doc(db, 'affiliates', user.uid), {
                              userId: user.uid,
                              name: user.displayName || 'شريك جديد',
                              phone: '',
                              balance: 0,
                              createdAt: serverTimestamp()
                            });
                          } catch (err) {
                            console.error("Error auto-creating affiliate:", err);
                          }
                        }
                        setCurrentScreen('affiliate_dashboard');
                      }
                    }}
                    className="w-full sm:w-auto relative group overflow-hidden bg-gradient-to-r from-amber-500 to-yellow-500 p-4 rounded-2xl flex items-center justify-center gap-3 transition-transform hover:scale-[1.02] active:scale-95 shadow-xl shadow-amber-500/20"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-900/20 flex items-center justify-center shrink-0">
                      <Briefcase size={22} className="text-slate-900" />
                    </div>
                    <div className="text-right">
                      <h4 className="text-slate-950 font-black text-sm sm:text-base mb-0.5">اعمل لدينا</h4>
                      <p className="text-slate-800 font-bold text-[10px] sm:text-xs">
                        انضم كشريك واربح 25 جنيه عن كل عملية
                      </p>
                    </div>
                  </button>
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
                      <label className="text-sm font-bold text-slate-300">اختر المنصة لإرسال كود القسيمة:</label>
                      <select 
                        value={couponProvider}
                        onChange={(e) => setCouponProvider(e.target.value)}
                        dir="ltr"
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-emerald-400 focus:outline-none focus:border-emerald-500 text-center appearance-none"
                      >
                        <option value="1xBet">1xBet</option>
                        <option value="MelBet">MelBet</option>
                        <option value="linebet">linebet</option>
                      </select>
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
                          <span className="text-amber-500 text-xs font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">{order.couponProvider || '1xBet'}</span>
                          <span className="text-slate-400 text-xs truncate max-w-[100px]">{order.fileName}</span>
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

            {/* --- USER DASHBOARD --- */}
            {currentScreen === 'user_dashboard' && user && !isAdmin && !isLocalAdmin && (
              <motion.div 
                key="user_dashboard"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-6 flex flex-col justify-center min-h-[500px]"
              >
                <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-2xl w-full max-w-sm mx-auto relative overflow-hidden flex flex-col items-center">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full translate-x-1/4 -translate-y-1/2" />
                  
                  <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/20 mb-6 relative z-10 border-4 border-slate-950">
                    <User size={40} className="text-amber-50" />
                  </div>
                  
                  <h2 className="text-2xl font-black mb-2 text-white relative z-10 text-center">
                    {user.displayName || user.email?.split('@')[0]}
                  </h2>
                  <p className="text-slate-400 text-sm mb-8">{user.email?.includes('@sportspredict.app') ? 'حساب محلي' : user.email}</p>

                  <div className="w-full space-y-3 relative z-10">
                    <button 
                      onClick={() => setCurrentScreen('orders')}
                      className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-md border border-slate-700/50"
                    >
                      <ReceiptText size={20} className="text-amber-500" />
                      طلباتي السابقة
                    </button>

                    <button 
                      onClick={handleSignOut}
                      className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-md border border-red-500/20 mt-4"
                    >
                      <LogOut size={20} />
                      تسجيل الخروج
                    </button>
                  </div>
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
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-bold text-slate-300">{order.displayId}</span>
                          {order.couponProvider && (
                            <span className="text-amber-500 text-[10px] font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 w-max">{order.couponProvider}</span>
                          )}
                        </div>
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

            {/* --- AUTH SCREEN --- */}
            {currentScreen === 'auth' && (
              <motion.div 
                key="auth"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-4 flex flex-col justify-center min-h-[500px]"
              >
                <div className="bg-slate-900 border border-emerald-500/20 rounded-[2rem] p-6 sm:p-8 shadow-2xl shadow-emerald-500/5 w-full max-w-sm mx-auto relative overflow-hidden flex flex-col items-center">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 blur-3xl rounded-full translate-x-1/4 -translate-y-1/4 pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 blur-3xl rounded-full -translate-x-1/4 translate-y-1/4 pointer-events-none" />
                  
                  <div className="w-20 h-20 bg-gradient-to-br from-slate-800 to-slate-900 rounded-[1.5rem] flex items-center justify-center shadow-inner border mx-auto mb-6 relative z-10 border-slate-700">
                    <Trophy size={40} className="text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                  </div>

                    <div className="flex flex-col gap-4 relative z-10 w-full mt-2">
                       <div className="text-center mb-6">
                        <h2 className="text-2xl font-black text-white mb-1">تسجيل الدخول</h2>
                        <p className="text-slate-400 text-xs">مرحباً بك في منصة التوقعات الرياضية الأقوى</p>
                       </div>

                       {authError && (
                          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl text-center flex items-center justify-center gap-2 mb-2">
                            <AlertCircle size={14} />
                            <span>{authError}</span>
                          </div>
                        )}

                      <button 
                        onClick={() => {
                          handleSignIn();
                        }}
                        className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl flex items-center justify-center gap-3 transition-colors border border-slate-700/50 hover:border-slate-500/50 text-[15px]"
                      >
                        <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                          <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                          <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                          <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                          <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
                        </svg>
                        المتابعة بحساب جوجل
                      </button>
                    </div>
                </div>
              </motion.div>
            )}

            {/* --- AFFILIATE JOIN SCREEN --- */}
            {currentScreen === 'affiliate_join' && (
              <motion.div 
                key="affiliate_join"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-4 flex flex-col justify-center min-h-[500px]"
              >
                <div className="bg-slate-900 border border-amber-500/20 rounded-[2rem] p-6 sm:p-8 shadow-2xl w-full max-w-sm mx-auto flex flex-col items-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-amber-500/10 to-transparent rounded-[1.5rem] flex items-center justify-center border mx-auto mb-6 border-amber-500/40">
                    <Briefcase size={40} className="text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                  </div>
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-black text-white mb-2">اعمل معنا</h2>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      انضم كشريك لمنصتنا واربح <span className="text-amber-500 font-bold">25 جنيه</span> عن كل عملية تتم عن طريق رابطك. سجل الآن!
                    </p>
                  </div>
                  <form onSubmit={handleJoinAffiliate} className="w-full flex flex-col gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 pr-1">الاسم الحقيقي (ثلاثي)</label>
                      <input 
                        type="text" 
                        value={affiliateName}
                        onChange={(e) => setAffiliateName(e.target.value)}
                        placeholder="أدخل اسمك الحقيقي"
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-sm"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 pr-1">رقم الهاتف (كاش)</label>
                      <input 
                        type="tel" 
                        value={affiliatePhone}
                        onChange={(e) => setAffiliatePhone(e.target.value)}
                        placeholder="أدخل رقم الكاش الخاص بك"
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-sm"
                        required
                      />
                    </div>
                    <button 
                      type="submit" 
                      className="w-full py-4 mt-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black rounded-xl transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:shadow-[0_0_25px_rgba(245,158,11,0.4)] text-[15px] flex items-center justify-center gap-2"
                    >
                      تسجيل كشريك
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentScreen('home')}
                      className="text-slate-400 text-xs font-bold hover:text-white transition-colors"
                    >
                      إلغاء والعودة للرئيسية
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {/* --- AFFILIATE DASHBOARD SCREEN --- */}
            {currentScreen === 'affiliate_dashboard' && (
              <motion.div 
                key="affiliate_dashboard"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-4 pb-20 items-center justify-center min-h-full flex"
              >
                <div className="w-full max-w-sm flex flex-col gap-5">
                  <div className="text-center mb-2">
                    <h2 className="text-2xl font-black text-white">لوحة الشريك</h2>
                    <p className="text-slate-400 text-sm mt-1">
                      مرحباً <span className="text-amber-500 font-bold">{affiliateData?.name || user?.displayName || 'شريكنا العزيز'}</span>
                    </p>
                  </div>

                  <div className="bg-slate-900 border border-emerald-500/30 p-6 rounded-[2rem] shadow-xl text-center">
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-[1rem] flex flex-col items-center justify-center border mx-auto mb-4 border-emerald-500/30">
                      <Wallet size={30} className="text-emerald-400" />
                    </div>
                    <h4 className="text-slate-400 text-sm font-bold mb-3">رصيدي القابل للسحب</h4>
                    <div className="flex items-center justify-center gap-4">
                      <p className="text-4xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                        {affiliateData?.balance || 0} <span className="text-lg text-emerald-400">ج.م</span>
                      </p>
                      <button 
                        onClick={() => alert('الرجاء التواصل مع الدعم لطلب سحب الرصيد')}
                        className="bg-emerald-500 hover:bg-emerald-600 border border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] px-5 py-2 rounded-xl text-sm font-bold transition-all"
                      >
                        سحب
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] shadow-xl">
                    <div className="flex flex-col gap-3">
                      <p className="text-slate-300 text-sm font-medium text-center leading-relaxed">
                        احصل على رابط المشاركة الخاص بك واربح مبلغ <span className="text-amber-500 font-bold">25 جنيه</span> من كل عملية تتم من خلالك
                      </p>
                      <button 
                        onClick={() => {
                          const link = `${window.location.origin}/?ref=${user?.uid || ''}`;
                          navigator.clipboard.writeText(link);
                          alert('تم نسخ رابط المشاركة الخاص بك بنجاح!');
                        }}
                        className="w-full py-4 mt-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black rounded-xl transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:shadow-[0_0_25px_rgba(245,158,11,0.4)] text-[15px] flex items-center justify-center gap-2"
                      >
                        <LinkIcon size={20} />
                        انسخ رابط المشاركة
                      </button>
                    </div>
                  </div>
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
              isActive={currentScreen === 'admin_dashboard' || currentScreen === 'user_dashboard'} 
              onClick={() => {
                 if (!user) setCurrentScreen('auth');
                 else if (isAdmin || isLocalAdmin) setCurrentScreen('admin_dashboard');
                 else setCurrentScreen('user_dashboard');
              }} 
            />
          </nav>
        </div>
      </div>

      {showLoginPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-slate-900 border border-slate-700/50 p-6 rounded-[2rem] shadow-2xl max-w-sm w-full text-center relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20 mx-auto mb-4 relative z-10">
              <User size={32} className="text-amber-50" />
            </div>
            <h3 className="text-xl font-black mb-2 text-white relative z-10">عذراً، يجب التسجيل أولاً</h3>
            <p className="text-slate-400 text-sm mb-6 relative z-10 leading-relaxed">
              قم بتسجيل الدخول بحساب جوجل الخاص بك لتتمكن من الوصول للتوقعات.
            </p>
            <div className="flex flex-col gap-3 relative z-10">
              <button 
                onClick={() => {
                  setShowLoginPrompt(false);
                  setCurrentScreen('auth');
                }}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black rounded-xl hover:scale-[1.02] active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2"
              >
                اذهب للتسجيل
              </button>
              <button 
                onClick={() => setShowLoginPrompt(false)}
                className="w-full py-3 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700 transition-all border border-slate-700 hover:text-white"
              >
                إلغاء
              </button>
            </div>
          </motion.div>
        </div>
      )}
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


