import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Copy, Trash2, Music, Sparkles, 
  RefreshCw, Check, AlertCircle, PlaySquare, Info, 
  Feather, Volume2, Search, BookOpen,
  Download, Save, FolderOpen, X, Headphones,
  Upload, FileAudio, Moon, Sun, Languages, History as HistoryIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { useVirtualizer } from '@tanstack/react-virtual';

import { translations } from './translations';

const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'egyptian-studio-pro';

const App = () => {
  const [inputText, setInputText] = useState('');
  const [outputResult, setOutputResult] = useState('');
  const [outputType, setOutputType] = useState(''); 
  
  const [searchWord, setSearchWord] = useState('');
  const [wordSuggestions, setWordSuggestions] = useState<any>(null); 
  const [isSearchingWord, setIsSearchingWord] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState(false);
  const [history, setHistory] = useState<{id: string, type: string, input: string, output: string, timestamp: number}[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hafiz_history');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploadSuccess, setIsUploadSuccess] = useState(false);

  useEffect(() => {
    localStorage.setItem('hafiz_history', JSON.stringify(history));
  }, [history]);

  const addToHistory = (type: string, input: string, output: string) => {
    const newItem = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      input,
      output,
      timestamp: Date.now()
    };
    setHistory(prev => [newItem, ...prev].slice(0, 50)); // Keep last 50 items
  };
  const [genre, setGenre] = useState('mahraganat');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');

  const t = translations[language];

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.setAttribute('lang', language);
    document.documentElement.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
  }, [language]);

  const toggleDarkMode = () => setDarkMode(!darkMode);
  const toggleLanguage = () => setLanguage(language === 'ar' ? 'en' : 'ar');
  
  const recognitionRef = useRef<any>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputResult && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [outputResult]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = language === 'ar' ? 'ar-EG' : 'en-US'; 

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript) {
          setInputText(prev => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };
      recognitionRef.current.onerror = (e: any) => {
        console.error("Mic error:", e.error);
        setIsListening(false);
      };
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setError(null);
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        setError(t.micError);
      }
    }
  };

  const speakText = (textToSpeak: string) => {
    if (!window.speechSynthesis) {
      setError(t.speechError);
      return;
    }
    window.speechSynthesis.cancel();
    
    let cleanText = textToSpeak.replace(/\[.*?\]/g, '').trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = language === 'ar' ? 'ar-EG' : 'en-US'; 
    
    const voices = window.speechSynthesis.getVoices();
    const targetVoice = voices.find(v => v.lang.includes(language === 'ar' ? 'ar-EG' : 'en-US')) || voices.find(v => v.lang.includes(language));
    if (targetVoice) {
      utterance.voice = targetVoice;
    }

    utterance.rate = 0.85; 
    
    window.speechSynthesis.speak(utterance);
  };

  const callAI = async (promptText: string, systemInstruction: string, useSearch = false, expectJson = false, audioData?: { data: string, mimeType: string }) => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let retries = 0;
    const maxRetries = 5;

    const config: any = {
      systemInstruction: systemInstruction,
    };

    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }
    
    if (expectJson) {
      config.responseMimeType = "application/json";
    }

    const contents: any = audioData 
      ? [
          { inlineData: { data: audioData.data, mimeType: audioData.mimeType } },
          promptText
        ]
      : promptText;

    while (retries < maxRetries) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: contents,
          config: config
        });

        if (response.text) return response.text.trim();
      } catch (e) {
        retries++;
        if (retries < maxRetries) await new Promise(r => setTimeout(r, Math.pow(2, retries) * 1000));
      }
    }
    throw new Error(language === 'ar' ? "فشل الاتصال بالخادم." : "Connection failed.");
  };

  const handleGenerateSong = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true); setError(null); setOutputResult(''); setOutputType('song');

    const metaTags = `
[Style: Egyptian Urban, Street Flow, Non-Classical]
[Vocal Delivery: Pure Egyptian Slang, Casual Rhythm]
[Pronunciation: Ignore Fusha rules strictly. Read diacritics as beat markers for Egyptian street accent]
    `.trim();

    const genreInstructions: Record<string, string> = {
      mahraganat: "مهرجانات شعبية مصرية. إيقاع 'مقسوم' سريع، طاقة عالية، كلمات شوارع أصلية، 'سرسجة' شيك، قوافي شعبية مبتكرة، استخدام مصطلحات 'المناطق الشعبية' والجدعنة.",
      shaabi: "شعبي مصري أصيل (مودرن أو قديم). مواويل، حكم شعبية، كلمات فيها شجن أو فرح شعبي، استخدام آلات زي الأوكورديون والكمانجا في الروح.",
      trap_shaabi: "تراب شعبي (Trap Shaabi). مزيج بين إيقاعات التراب العالمي والروح الشعبية المصرية. كلمات فيها 'إيجو' (Ego)، فخر، مصطلحات شباب الشارع المودرن، قافية قوية ومقطعة.",
      rap_egy: "راب مصري (Old school or New school). تركيز عالي على القافية والوزن، 'بانش لاينز' (Punchlines) قوية، حكاوي من الواقع المصري.",
      pop_egy: "بوب مصري شبابي. كلمات خفيفة، قوافي سهلة الحفظ، روح 'فرفشة' أو حب مودرن.",
      romantic: "رومانسي/دراما مصري. كلمات عميقة، شجن، استخدام استعارات مكنية من العامية المصرية الحزينة أو الرومانسية."
    };

    const sysPrompt = `أنت 'حَافِظ'، كاتب الأغاني والشاعر والمنتج الفني الأول المتخصص في العامية المصرية بجميع ألوانها (شعبي، مهرجانات، تراب، راب).
    1. الأسلوب المطلوب: ${genreInstructions[genre]}
    2. اللغة: عامية مصرية 'بيور' (Pure Egyptian Slang). تجنب أي كلمات فصحى تماماً. استخدم لغة الشارع الحقيقية، المصطلحات الدارجة، وروح 'السرسجة' الشيك أو الشجن الشعبي حسب النوع.
    3. الإبداع: استخدم استعارات من الشارع المصري، أمثال شعبية مطورة، لغة 'الشباب' الحالية، ومصطلحات 'التريند'.
    4. التشكيل: ضع تشكيلاً إيقاعياً (Phonetic Diacritics) يضمن نطق الكلمات بلهجة مصرية 100% (مثلاً: الجيم دائماً G، القاف غالباً همزة، التسكين في مكانه الصحيح).
    5. الهيكل: المستخدم سيعطيك فكرة أو كلمات بسيطة، حولها لعمل فني متكامل ومبهر مقسم إلى مقاطع واضحة.
    6. **قانون صارم (لا تخالفه أبداً):** التزم بهذا الترتيب والتقسيم في المخرج النهائي:

${metaTags}

[Intro]
(كلمات البداية أو الدخلة)

[Verse 1]
(المقطع الأول)

[Chorus]
(اللازمة - الكورس - اجعله قوي جداً ويعلق في الذهن)

[Verse 2]
(المقطع الثاني)

[Chorus]
(إعادة اللازمة)

[Outro]
(كلمات النهاية أو القفلة)

---
[Music Analysis & Suggestions]
(هنا اقترح بدقة أنواع الموسيقى المصرية التي تليق على هذه الكلمات تحديداً ووضح السبب)

[Suno AI Prompt]
(هنا اكتب برومبت إنجليزي احترافي جداً لموقع Suno AI يعكس روح الأغنية والآلات المقترحة)
    
    أخرج النص فقط بدون أي تعليقات خارجية أو مقدمات.`;

    try {
      const result = await callAI(language === 'ar' ? `قم بترتيب وتأليف الأغنية باحترافية بناءً على: "${inputText}"` : `Compose a professional song based on: "${inputText}"`, sysPrompt);
      setOutputResult(result);
      addToHistory('song', inputText, result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTashkeelOnly = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true); setError(null); setOutputResult(''); setOutputType('tashkeel');

    const sysPrompt = `أنت 'حَافِظ'، الخبير الأول في فونوتيكا (علم أصوات) الشارع المصري. 
    مهمتك: وضع التشكيل (الحركات) الكامل على النص ليعكس النطق العامي المصري 'الحقيقي' بدقة مذهلة. 
    ركز على: 
    1. نطق الجيم القاهرية (G) والقاف (همزة غالباً). 
    2. التسكين والشدة في لغة الشارع والمهرجانات. 
    3. إدغام الحروف (مثلاً: 'مش عارف' تنطق 'مشعارف').
    4. نبرة الصوت (Intonation) الخاصة بالمصريين في الكلام السريع.
    لا تغير الكلمات، فقط شكلها لتنطق مصرية 100%. أخرج النص المشكل فقط.`;

    try {
      const result = await callAI(language === 'ar' ? `شكّل هذا النص بالعامية المصرية بدقة صوتية: "${inputText}"` : `Add diacritics to this text in Egyptian slang: "${inputText}"`, sysPrompt);
      setOutputResult(result);
      speakText(result);
      addToHistory('tashkeel', inputText, result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpellCheckAndSpeak = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true); setError(null); setOutputResult(''); setOutputType('spellcheck');

    const sysPrompt = `أنت المصحح اللغوي 'البروفيشنال' للعامية المصرية ولغة الشارع.
    قم بتصحيح الأخطاء الإملائية مع الحفاظ الكامل على 'الروشنة' وروح العامية (لا تحولها للفصحى أبداً). 
    ضع تشكيلاً كاملاً ودقيقاً يوجه القارئ لنطق النص بلهجة مصرية أصلية (Phonetic Diacritics).
    إذا كانت الكلمة مكتوبة بطريقة 'سرسجة' مقبولة في الأغاني، حافظ عليها وصححها فنياً فقط.
    أخرج النص المصحح والمشكل فقط.`;

    try {
      const result = await callAI(language === 'ar' ? `صحح هذا النص إملائياً وشكله للعامية: "${inputText}"` : `Correct spelling and add diacritics to this text: "${inputText}"`, sysPrompt);
      setOutputResult(result);
      speakText(result); 
      addToHistory('spellcheck', inputText, result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWordSearch = async () => {
    if (!searchWord.trim()) return;
    setIsSearchingWord(true); setWordSuggestions(null);

    const sysPrompt = `أنت خبير لغوي في العامية المصرية واللغة العربية الفصحى.
    المستخدم سيعطيك كلمة.
    مهمتك: أعطني كل احتمالات التشكيل (الحركات) المختلفة لهذه الكلمة، بالإضافة إلى مرادفات (Synonyms) وأضداد (Antonyms) للكلمة بالعامية المصرية.
    **ركز أولاً وبشكل أساسي على معانيها ونطقها في العامية المصرية أو الدارجة**، ثم اذكر معانيها ونطقها في الفصحى إذا كان لها استخدام مختلف.
    أخرج النتيجة بصيغة JSON فقط كالتالي:
    {
      "suggestions": [
        {"word": "الكلمة_بالتشكيل", "meaning": "معنى هذا التشكيل (مصري أو فصحى) ومتى يستخدم باختصار"}
      ],
      "synonyms": ["مرادف1", "مرادف2"],
      "antonyms": ["ضد1", "ضد2"]
    }`;

    try {
      const result = await callAI(language === 'ar' ? `هات كل احتمالات التشكيل للكلمة دي: "${searchWord}"` : `Get all diacritics for this word: "${searchWord}"`, sysPrompt, false, true);
      const parsedData = JSON.parse(result);
      setWordSuggestions(parsedData);
      addToHistory('search', searchWord, result);
    } catch (err: any) {
      setWordSuggestions([{ word: language === 'ar' ? "خطأ" : "Error", meaning: language === 'ar' ? "حدث خطأ أثناء جلب التشكيلات، حاول مجدداً." : "Error fetching diacritics, try again." }]);
    } finally {
      setIsSearchingWord(false);
    }
  };

  const handleGenerateMusicPrompt = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true); setError(null); setOutputResult(''); setOutputType('music_prompt');

    const sysPrompt = `أنت خبير في هندسة البرومبتات (Prompt Engineering) لأدوات توليد الموسيقى بالذكاء الاصطناعي مثل Suno AI و Udio، ومتخصص في الموسيقى المصرية الحضرية.
    مهمتك: تحويل فكرة المستخدم إلى برومبت إنجليزي تقني دقيق يضمن خروج الموسيقى بروح مصرية أصلية.
    
    الأنماط الخاصة:
    - المهرجانات (Mahraganat): استخدم (Egyptian Mahraganat, Street Electro, Heavy 808 Darbuka, Aggressive Synth leads, Auto-tune vocals, 140-150 BPM, Cairo Street vibe, Maqsum rhythm, Shrill synthesizer).
    - التراب الشعبي (Trap Shaabi): استخدم (Egyptian Trap Shaabi, Dark cinematic atmosphere, Heavy bass, Trap hats mixed with Darbuka, Melodic slang vocals, Mahraganat elements, Urban Cairo sound).
    - الشعبي (Shaabi): استخدم (Traditional Egyptian Shaabi, Accordion, Kawala, Live percussion, Wedding style, Soulful street singing, Rhythmic, 110-120 BPM).
    
    يجب أن يتضمن البرومبت:
    1. [Style]: وصف دقيق للنمط (مثلاً: Modern Egyptian Mahraganat).
    2. [Instruments]: الآلات (Darbuka, Synth, 808, Accordion).
    3. [Vocal Style]: (Auto-tuned, Street-style, Soulful).
    4. [Atmosphere]: (High energy, Dark, Festive).
    
    أخرج النتيجة كبرومبت جاهز للنسخ واللصق في Suno/Udio. أضف شرحاً بسيطاً بالعربية لما يفعله هذا البرومبت.`;

    try {
      const result = await callAI(language === 'ar' ? `اكتب برومبت موسيقي احترافي لـ Suno بناءً على: "${inputText}" ونوع "${genre}"` : `Write a professional Suno music prompt based on: "${inputText}" and genre "${genre}"`, sysPrompt);
      setOutputResult(result);
      addToHistory('music_prompt', inputText, result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyzeLyrics = async () => {
    const textToAnalyze = outputResult.trim() || inputText.trim();
    if (!textToAnalyze) return;
    setIsLoading(true); setError(null); setOutputType('analysis');

    const sysPrompt = `أنت خبير موسيقي ومنتج فني (A&R) متخصص في الموسيقى المصرية الحديثة.
    مهمتك هي تحليل الكلمات المعطاة واقتراح أفضل ستايل موسيقي يليق بها، مع كتابة برومبت Suno AI احترافي.
    
    1. حلل 'مود' الكلمات (حزين، فرح، فخر، رقص، سرسجة، إلخ).
    2. اقترح 3 أنواع موسيقية مصرية تليق على الكلام (مثلاً: مهرجان مقسوم، تراب شعبي هادي، راب أولد سكول).
    3. اكتب برومبت Suno AI إنجليزي 'جبار' يجمع بين الروح المصرية والتقنيات العالمية.
    
    أخرج النتيجة بتنسيق واضح ومنظم باللغة العربية، مع جعل البرومبت بالإنجليزية.`;

    try {
      const result = await callAI(textToAnalyze, sysPrompt);
      setOutputResult(result);
      addToHistory('analysis', textToAnalyze.substring(0, 50) + "...", result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAudioFile(file);
      setIsUploadSuccess(false);
      setUploadProgress(0);
      
      // Simulate upload progress
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setUploadProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setIsUploadSuccess(true);
        }
      }, 100);
    }
  };

  const [rhymeWord, setRhymeWord] = useState('');
  const [lineToRewrite, setLineToRewrite] = useState('');

  const handleFindRhymes = async () => {
    if (!rhymeWord.trim()) return;
    setIsLoading(true); setError(null);
    
    const sysPrompt = `أنت خبير في القوافي الشعرية للعامية المصرية.
    مهمتك: أعطني قائمة بكلمات مصرية عامية لها نفس القافية (Rhyme) للكلمة التي سيعطيك إياها المستخدم.
    أخرج النتيجة بصيغة JSON فقط كالتالي:
    {
      "rhymes": ["كلمة1", "كلمة2", "كلمة3"]
    }`;

    try {
      const result = await callAI(language === 'ar' ? `هات كلمات لها نفس قافية: "${rhymeWord}"` : `Get words that rhyme with: "${rhymeWord}"`, sysPrompt, false, true);
      const parsedData = JSON.parse(result);
      setOutputResult(language === 'ar' ? `القوافي المقترحة لـ "${rhymeWord}":\n${parsedData.rhymes.join('\n')}` : `Suggested rhymes for "${rhymeWord}":\n${parsedData.rhymes.join('\n')}`);
      setOutputType('rhymes');
    } catch (err: any) {
      setError(language === 'ar' ? "حدث خطأ أثناء البحث عن القوافي." : "Error finding rhymes.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRewriteLine = async () => {
    if (!lineToRewrite.trim() || !inputText.trim()) return;
    setIsLoading(true); setError(null);
    
    const sysPrompt = `أنت خبير في كتابة الأغاني بالعامية المصرية.
    مهمتك: إعادة صياغة السطر الذي سيعطيك إياه المستخدم، مع الحفاظ التام على القافية (Rhyme) والوزن (Meter) الخاص بالسطر الأصلي، وبنفس أسلوب الأغنية.
    أخرج السطر الجديد فقط.`;

    try {
      const result = await callAI(language === 'ar' ? `أعد صياغة هذا السطر: "${lineToRewrite}"\n\nمع الحفاظ على القافية والوزن في سياق هذه الأغنية: "${inputText}"` : `Rewrite this line: "${lineToRewrite}"\n\nMaintaining rhyme and meter in the context of this song: "${inputText}"`, sysPrompt);
      setOutputResult(language === 'ar' ? `السطر الجديد:\n${result}` : `New line:\n${result}`);
      setOutputType('rewrite');
    } catch (err: any) {
      setError(language === 'ar' ? "حدث خطأ أثناء إعادة صياغة السطر." : "Error rewriting line.");
    } finally {
      setIsLoading(false);
    }
  };

  const processAudio = async (mode: 'general' | 'egyptian' | 'analyze_music') => {
    if (!audioFile) return;
    setIsLoading(true); setError(null); setOutputResult(''); 
    setOutputType(mode === 'analyze_music' ? 'analysis' : 'transcription');

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(audioFile);
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result.split(',')[1]);
          }
        };
        reader.onerror = reject;
      });

      const audioPart = { data: base64Data, mimeType: audioFile.type };

      let sysPrompt = "";
      let promptText = "";

      if (mode === 'egyptian') {
        sysPrompt = `أنت 'حَافِظ'، الخبير الأول والبروفيسور في تحليل وتفريغ اللهجة المصرية العامية الحية (خصوصاً لغة الشارع، المهرجانات، والراب).
        مهمتك: استمع بدقة شديدة للملف الصوتي، وفرغ الكلام بالعامية المصرية كما ينطق تماماً (حتى لو كانت كلمات 'سرسجة' أو مصطلحات تقنية موسيقية أو 'إيفيهات' دارجة).
        ضع تشكيلاً كاملاً ودقيقاً يوضح النطق المصري الصحيح (الجيم G، القاف همزة، إلخ).
        إذا كان هناك 'أديبس' (Ad-libs) أو أصوات خلفية مميزة، اذكرها بين قوسين.
        أخرج النص المفرغ والمشكل فقط باحترافية تامة.`;
        promptText = "قم بتفريغ هذا الصوت واكتبه بالعامية المصرية الأصلية مع التشكيل الدقيق جداً.";
      } else if (mode === 'analyze_music') {
        sysPrompt = `أنت منتج موسيقي وخبير (A&R) متخصص في الموسيقى المصرية الحديثة (مهرجانات، تراب شعبي، راب).
        مهمتك هي تحليل المقطع الصوتي المرفق بدقة تقنية عالية:
        1. تفريغ الكلمات بدقة (بالعامية المصرية).
        2. تحديد النوع الموسيقي بدقة (مثلاً: تراب شعبي، مهرجان مقسوم، شعبي دراما، راب سين).
        3. تحليل 'الوايب' (Vibe)، الآلات المستخدمة، وسرعة الإيقاع (BPM).
        4. كتابة برومبت Suno AI إنجليزي 'تقني محترف' يعيد إنتاج نفس الروح والتوزيع بدقة مذهلة.
        
        أخرج النتيجة بتنسيق واضح ومقسم إلى:
        - الكلمات المفرغة (بالعامية المصرية)
        - التحليل الموسيقي التقني
        - [Suno Prompt: اكتب البرومبت الإنجليزي هنا]`;
        promptText = "حلل المقطع ده باحترافية، واكتب كلماته بالعامية، وطلع لي برومبت Suno جبار بنفس الروح.";
      } else {
        sysPrompt = `أنت خبير في تفريغ الصوتيات بجميع اللغات واللهجات.
        مهمتك: استمع للملف الصوتي، تعرف على لغته أو لهجته، واكتب الكلام بدقة إملائية.
        ثم ضع التشكيل المناسب حسب لغة الأغنية أو المقطع الصوتي.
        أخرج النص المفرغ والمشكل فقط.`;
        promptText = "قم بتفريغ هذا الصوت واكتبه مع التشكيل المناسب للغته.";
      }

      const result = await callAI(promptText, sysPrompt, false, false, audioPart);
      setOutputResult(result);
      addToHistory(mode, audioFile.name, result);
    } catch (err: any) {
      setError(err.message || t.audioError);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!outputResult) return;
    const textArea = document.createElement("textarea");
    textArea.value = outputResult;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopyStatus(true);
      setTimeout(() => setCopyStatus(false), 2000);
    } catch (err) {}
    document.body.removeChild(textArea);
  };

  const saveInput = () => {
    localStorage.setItem('rika_saved_input', inputText);
  };

  const loadInput = () => {
    const saved = localStorage.getItem('rika_saved_input');
    if (saved) setInputText(saved);
  };

  const downloadOutput = () => {
    if (!outputResult) return;
    const blob = new Blob([outputResult], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rika_output_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadOutputDocx = async () => {
    if (!outputResult) return;
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: outputResult.split('\n').map(line => new Paragraph({
            children: [
              new TextRun({
                text: line,
                rightToLeft: true,
              })
            ],
          })),
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rika_output_${Date.now()}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const VirtualizedOutput = ({ text, type }: { text: string, type: string }) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const lines = text.split('\n');

    const rowVirtualizer = useVirtualizer({
      count: lines.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 40,
    });

    return (
      <div 
        ref={parentRef} 
        className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const line = lines[virtualRow.index];
            let content: React.ReactNode = line;
            
            if (type === 'song') {
              if (line.match(/^\[Style:.*\]|^\[Vocal Delivery:.*\]|^\[Pronunciation.*\]/i)) {
                content = <span className="block text-[#00ffcc] font-mono text-xs mt-1 mb-1 bg-[#00ffcc]/10 p-1.5 rounded-md w-fit" dir="ltr">{line}</span>;
              } else if (line.match(/^\[(.*?)\]$/)) {
                content = <span className={`block ${darkMode ? 'text-indigo-400 bg-indigo-900/30' : 'text-indigo-700 bg-indigo-100'} font-black mt-6 mb-2 text-sm tracking-widest uppercase w-fit px-2 py-1 rounded`}>{line}</span>;
              } else if (line.trim() === '') {
                content = <br />;
              } else {
                content = <span className={`block mb-1 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{line}</span>;
              }
            } else if (type === 'music_prompt' || type === 'analysis') {
              if (line.match(/\[(.*?)\]/)) {
                content = <span className="block text-amber-400 font-mono text-sm mt-2 mb-1 bg-amber-400/10 p-2 rounded-md border border-amber-400/20" dir="ltr">{line}</span>;
              } else if (line.trim() === '') {
                content = <br />;
              } else {
                content = <span className={`block mb-1 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{line}</span>;
              }
            } else {
              if (line.trim() === '') content = <br />;
              else content = <span className={`block mb-1 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>{line}</span>;
            }

            return (
              <div
                key={virtualRow.index}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const SkeletonLoader = ({ type }: { type: string }) => {
    const skeletonClass = `${darkMode ? 'bg-slate-800' : 'bg-slate-200'} rounded-lg`;
    
    const containerVariants = {
      hidden: { opacity: 0 },
      show: {
        opacity: 1,
        transition: {
          staggerChildren: 0.1
        }
      }
    };

    const itemVariants = {
      hidden: { opacity: 0, x: -10 },
      show: { opacity: 1, x: 0 }
    };

    if (type === 'song') {
      return (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-8 w-full">
          <div className="space-y-2">
            <motion.div variants={itemVariants} className={`h-4 w-48 ${skeletonClass} animate-pulse`}></motion.div>
            <motion.div variants={itemVariants} className={`h-4 w-32 ${skeletonClass} animate-pulse`}></motion.div>
          </div>
          {[1, 2].map(i => (
            <div key={i} className="space-y-4">
              <motion.div variants={itemVariants} className={`h-8 w-24 ${skeletonClass} opacity-50 animate-pulse`}></motion.div>
              <div className="space-y-3">
                <motion.div variants={itemVariants} className={`h-5 w-full ${skeletonClass} animate-pulse`}></motion.div>
                <motion.div variants={itemVariants} className={`h-5 w-11/12 ${skeletonClass} animate-pulse`}></motion.div>
                <motion.div variants={itemVariants} className={`h-5 w-4/5 ${skeletonClass} animate-pulse`}></motion.div>
              </div>
            </div>
          ))}
        </motion.div>
      );
    }
    
    if (type === 'analysis' || type === 'music_prompt') {
      return (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6 w-full">
          <motion.div variants={itemVariants} className={`h-6 w-40 ${skeletonClass} animate-pulse`}></motion.div>
          <div className="space-y-3">
            <motion.div variants={itemVariants} className={`h-4 w-full ${skeletonClass} animate-pulse`}></motion.div>
            <motion.div variants={itemVariants} className={`h-4 w-full ${skeletonClass} animate-pulse`}></motion.div>
            <motion.div variants={itemVariants} className={`h-4 w-3/4 ${skeletonClass} animate-pulse`}></motion.div>
          </div>
          <motion.div variants={itemVariants} className={`h-24 w-full ${skeletonClass} border-2 border-dashed ${darkMode ? 'border-slate-700' : 'border-slate-300'} animate-pulse`}></motion.div>
          <div className="space-y-2">
            <motion.div variants={itemVariants} className={`h-4 w-full ${skeletonClass} animate-pulse`}></motion.div>
            <motion.div variants={itemVariants} className={`h-4 w-2/3 ${skeletonClass} animate-pulse`}></motion.div>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-4 w-full">
        <motion.div variants={itemVariants} className={`h-5 w-full ${skeletonClass} animate-pulse`}></motion.div>
        <motion.div variants={itemVariants} className={`h-5 w-full ${skeletonClass} animate-pulse`}></motion.div>
        <motion.div variants={itemVariants} className={`h-5 w-4/5 ${skeletonClass} animate-pulse`}></motion.div>
        <motion.div variants={itemVariants} className={`h-5 w-full ${skeletonClass} animate-pulse`}></motion.div>
        <motion.div variants={itemVariants} className={`h-5 w-3/4 ${skeletonClass} animate-pulse`}></motion.div>
        <motion.div variants={itemVariants} className={`h-5 w-1/2 ${skeletonClass} animate-pulse`}></motion.div>
      </motion.div>
    );
  };

  const LoadingIndicator = ({ task, type }: { task: string, type: string }) => (
    <div className="flex flex-col items-center justify-center p-4 md:p-8 space-y-8 w-full">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-indigo-500/20 rounded-full"></div>
          <div className="absolute top-0 left-0 w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400 animate-pulse" size={20} />
        </div>
        <p className={`${darkMode ? 'text-indigo-300' : 'text-indigo-600'} font-bold animate-pulse text-xl tracking-wide`}>{task}...</p>
      </div>
      <div className="w-full max-w-2xl opacity-40">
        <SkeletonLoader type={type} />
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-[#09090b] text-slate-200' : 'bg-slate-50 text-slate-900'} font-sans p-3 md:p-6 transition-colors duration-500`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <header className={`flex flex-col md:flex-row items-start md:items-center justify-between ${darkMode ? 'bg-[#121217] border-slate-800' : 'bg-white border-slate-200'} p-5 rounded-3xl border shadow-xl gap-6 transition-colors duration-500`}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.4)] shrink-0">
                <img 
                  src="https://i.ibb.co/ZRDHCGHz/Untitled-1080-x-1080-px.jpg" 
                  alt={t.title} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-end gap-2">
                  <h1 className={`text-4xl md:text-6xl font-ruqaa ${darkMode ? 'neon-ar' : 'text-indigo-600'} leading-none pb-2`}>
                    {t.title}
                  </h1>
                  <span className={`text-sm md:text-lg font-arabic ${darkMode ? 'text-sky-300/80' : 'text-sky-600'} mb-3 font-light italic`}>
                    {t.subtitle}
                  </span>
                </div>
                <div className="h-0.5 w-16 bg-gradient-to-l from-sky-500 to-transparent rounded-full hidden md:block shadow-[0_0_8px_rgba(56,189,248,0.8)] mb-2"></div>
              </div>
            </div>
            <p className={`text-sm md:text-base ${darkMode ? 'text-slate-300 border-slate-800/50' : 'text-slate-600 border-slate-200'} font-bold tracking-wide leading-relaxed border-t pt-3`}>
              {t.description}
            </p>
          </div>
          
          <div className="flex flex-col gap-4 w-full md:w-auto">
            <div className="flex justify-end gap-2">
              <button 
                onClick={toggleLanguage}
                className={`p-2.5 rounded-xl ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white' : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-indigo-600'} border transition-all duration-300 shadow-sm min-w-[44px] min-h-[44px] flex items-center justify-center`}
                aria-label={t.switchLang}
              >
                <Languages size={20} />
                <span className="ms-2 text-xs font-bold">{t.switchLang}</span>
              </button>
              <button 
                onClick={toggleDarkMode}
                className={`p-2.5 rounded-xl ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white' : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-indigo-600'} border transition-all duration-300 shadow-sm min-w-[44px] min-h-[44px] flex items-center justify-center`}
                aria-label={darkMode ? 'Light Mode' : 'Dark Mode'}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
            
            <div className={`flex flex-wrap justify-center ${darkMode ? 'bg-[#09090b] border-slate-800' : 'bg-slate-50 border-slate-200'} rounded-xl p-1 border w-full md:w-auto gap-1`}>
               {Object.entries(t.genres).map(([id, label]) => (
                 <div key={id} className="relative group flex-1 md:flex-none">
                   <button 
                      onClick={() => setGenre(id)}
                      className={`w-full px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all duration-300 min-h-[40px] ${
                        genre === id 
                        ? (darkMode ? 'bg-slate-800 text-indigo-400 shadow-md' : 'bg-white text-indigo-600 shadow-md border border-slate-200')
                        : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600')
                      }`}
                    >
                     {label}
                   </button>
                   <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 w-40 text-center shadow-xl border border-slate-700">
                     {t.genreDescriptions[id as keyof typeof t.genreDescriptions]}
                     <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800"></div>
                   </div>
                 </div>
               ))}
            </div>
          </div>
        </header>

        {/* Word Inspector Card */}
        <div className={`${darkMode ? 'bg-[#1a1a24] border-indigo-900/50 shadow-indigo-500/10' : 'bg-white border-slate-200 shadow-slate-200'} rounded-2xl p-4 border shadow-lg transition-all duration-500`}>
          <div className="flex flex-col md:flex-row gap-3 items-center">
            <div className={`flex items-center gap-2 ${darkMode ? 'text-indigo-300' : 'text-indigo-600'} w-full md:w-auto font-bold text-sm`}>
              <Search size={18} />
              <span>{t.inspectorTitle}</span>
            </div>
            <div className="flex w-full gap-2 relative">
              <input 
                type="text"
                value={searchWord}
                onChange={(e) => setSearchWord(e.target.value)}
                placeholder={t.inspectorPlaceholder}
                className={`flex-1 ${darkMode ? 'bg-[#09090b] border-slate-700 text-white focus:ring-indigo-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-indigo-400'} border rounded-xl px-4 py-2 text-base focus:ring-1 transition-all min-h-[44px]`}
              />
              <button 
                onClick={handleWordSearch}
                disabled={isSearchingWord || !searchWord.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 transition-all flex items-center gap-2 shadow-md hover:shadow-indigo-500/40 min-h-[44px]"
              >
                {isSearchingWord ? <RefreshCw size={16} className="animate-spin" /> : <BookOpen size={16} />}
                {t.getDiacritics}
              </button>
            </div>
          </div>
          <AnimatePresence mode="wait">
            {wordSuggestions && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="mt-4 space-y-4"
              >
                {wordSuggestions.suggestions && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {wordSuggestions.suggestions.map((item: any, index: number) => (
                      <div key={index} className={`flex justify-between items-center p-3 ${darkMode ? 'bg-[#09090b] border-slate-800 hover:border-indigo-500/50' : 'bg-slate-50 border-slate-200 hover:border-indigo-400'} rounded-xl border transition-colors`}>
                        <div>
                          <span className={`text-xl font-bold ${darkMode ? 'text-indigo-400' : 'text-indigo-600'} font-arabic`}>{item.word}</span>
                          <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} mt-1`}>{item.meaning}</p>
                        </div>
                        <button 
                          onClick={() => speakText(item.word)} 
                          className={`p-2.5 ${darkMode ? 'bg-indigo-900/30 text-indigo-300 hover:bg-indigo-600' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-600'} rounded-xl hover:text-white transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center`}
                          aria-label={t.speakBtn}
                        >
                          <Volume2 size={20} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {wordSuggestions.synonyms && wordSuggestions.synonyms.length > 0 && (
                    <div className={`p-4 ${darkMode ? 'bg-[#09090b] border-slate-800' : 'bg-slate-50 border-slate-200'} rounded-xl border`}>
                      <h4 className={`text-sm font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'} mb-2`}>{t.synonyms}</h4>
                      <div className="flex flex-wrap gap-2">
                        {wordSuggestions.synonyms.map((s: string, i: number) => (
                          <span key={i} className={`px-2 py-1 ${darkMode ? 'bg-emerald-900/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'} rounded text-xs`}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {wordSuggestions.antonyms && wordSuggestions.antonyms.length > 0 && (
                    <div className={`p-4 ${darkMode ? 'bg-[#09090b] border-slate-800' : 'bg-slate-50 border-slate-200'} rounded-xl border`}>
                      <h4 className={`text-sm font-bold ${darkMode ? 'text-red-400' : 'text-red-600'} mb-2`}>{t.antonyms}</h4>
                      <div className="flex flex-wrap gap-2">
                        {wordSuggestions.antonyms.map((a: string, i: number) => (
                          <span key={i} className={`px-2 py-1 ${darkMode ? 'bg-red-900/20 text-red-300' : 'bg-red-100 text-red-700'} rounded text-xs`}>{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className={`${darkMode ? 'bg-[#121217] border-slate-800 shadow-indigo-500/5' : 'bg-white border-slate-200 shadow-slate-200'} rounded-3xl p-5 md:p-6 border shadow-xl transition-all duration-500`}>
          
          {/* Audio Upload Section */}
          <div className={`mb-6 p-4 ${darkMode ? 'bg-[#09090b] border-slate-800' : 'bg-slate-50 border-slate-200'} border rounded-2xl`}>
            <div className="flex flex-col w-full gap-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex items-center gap-2 ${darkMode ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'} px-4 py-2 rounded-xl text-sm font-bold transition-colors min-h-[44px]`}
                  >
                    <Upload size={18} /> {audioFile ? t.changeAudio : t.uploadAudio}
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleAudioUpload} 
                    accept="audio/*" 
                    className="hidden" 
                    aria-label={t.uploadAudio}
                  />
                  {audioFile && (
                    <div className="flex flex-col gap-1">
                      <span className={`text-xs ${darkMode ? 'text-emerald-400' : 'text-emerald-600'} font-bold flex items-center gap-1`}>
                        {isUploadSuccess ? <Check size={14} /> : <RefreshCw size={14} className="animate-spin" />} 
                        {audioFile.name}
                      </span>
                      {!isUploadSuccess && (
                        <div className="w-32 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500 transition-all duration-300" 
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
                        </div>
                      )}
                      {isUploadSuccess && (
                        <span className="text-[10px] text-emerald-500 font-medium">
                          {language === 'ar' ? 'تم الرفع بنجاح' : 'Upload successful'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                
                {audioFile && isUploadSuccess && (
                  <div className="flex flex-wrap gap-2 w-full md:w-auto mt-3 md:mt-0">
                    <button 
                      onClick={() => processAudio('general')}
                      disabled={isLoading}
                      className={`flex-1 md:flex-none flex items-center justify-center gap-2 ${darkMode ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border-blue-500/30' : 'bg-blue-100 text-blue-600 hover:bg-blue-200 border-blue-200'} border px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 min-h-[44px]`}
                    >
                      <FileAudio size={18} /> {t.transcribeGeneral}
                    </button>
                    <button 
                      onClick={() => processAudio('egyptian')}
                      disabled={isLoading}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-lg shadow-indigo-500/20 min-h-[56px]"
                    >
                      <FileAudio size={18} /> {t.transcribeEgyptian}
                    </button>
                    <button 
                      onClick={() => processAudio('analyze_music')}
                      disabled={isLoading}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-lg shadow-amber-500/20 min-h-[56px]"
                    >
                      <Music size={18} /> {t.analyzeMusic}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* New Tools Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="flex gap-2">
              <input 
                type="text"
                value={rhymeWord}
                onChange={(e) => setRhymeWord(e.target.value)}
                placeholder={t.rhymePlaceholder}
                className={`flex-1 ${darkMode ? 'bg-[#09090b] border-slate-800 text-slate-200 focus:ring-indigo-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-indigo-400'} border rounded-xl p-3 text-base focus:ring-1 transition-all min-h-[44px]`}
              />
              <button 
                onClick={handleFindRhymes}
                disabled={isLoading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-md hover:shadow-indigo-500/30 min-h-[44px]"
              >
                {t.rhymes}
              </button>
            </div>
            <div className="flex gap-2">
              <input 
                type="text"
                value={lineToRewrite}
                onChange={(e) => setLineToRewrite(e.target.value)}
                placeholder={t.rewritePlaceholder}
                className={`flex-1 ${darkMode ? 'bg-[#09090b] border-slate-800 text-slate-200 focus:ring-indigo-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-indigo-400'} border rounded-xl p-3 text-base focus:ring-1 transition-all min-h-[44px]`}
              />
              <button 
                onClick={handleRewriteLine}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-md hover:shadow-emerald-500/30 min-h-[44px]"
              >
                {t.rewrite}
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center mb-3">
            <label className={`text-sm font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'} flex items-center gap-2`}>
               {t.mainInputLabel}
            </label>
            <div className="flex gap-2">
              <button onClick={loadInput} className={`${darkMode ? 'text-slate-600 hover:text-indigo-400' : 'text-slate-400 hover:text-indigo-600'} transition-colors p-1 min-w-[44px] min-h-[44px] flex items-center justify-center`} aria-label={t.loadSaved}>
                <FolderOpen size={18} />
              </button>
              <button onClick={saveInput} className={`${darkMode ? 'text-slate-600 hover:text-emerald-400' : 'text-slate-400 hover:text-emerald-600'} transition-colors p-1 min-w-[44px] min-h-[44px] flex items-center justify-center`} aria-label={t.saveText}>
                <Save size={18} />
              </button>
              <button onClick={() => setInputText('')} className={`${darkMode ? 'text-slate-600 hover:text-red-400' : 'text-slate-400 hover:text-red-600'} transition-colors p-1 min-w-[44px] min-h-[44px] flex items-center justify-center`} aria-label={t.clear}>
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t.mainInputPlaceholder}
            className={`w-full h-32 ${darkMode ? 'bg-[#09090b] border-slate-800 text-slate-200 focus:ring-indigo-500 placeholder:text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-indigo-400 placeholder:text-slate-400'} border rounded-2xl p-4 text-base focus:ring-1 focus:border-indigo-500 resize-none font-arabic transition-all min-h-[120px]`}
            aria-label={t.mainInputLabel}
          />

          {/* Example Prompts */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'} py-1 font-bold`}>{t.examples}</span>
            {[
              { label: t.exSong, text: language === 'ar' ? 'قصة شاب بيكافح في زحمة القاهرة وعنده طموح كبير' : 'Story of a young man struggling in Cairo traffic with big ambition' },
              { label: language === 'ar' ? 'مهرجان: زميلي السند' : 'Mahragan: My Loyal Friend', text: language === 'ar' ? 'اكتب مهرجان عن الصحاب الجدعة والرجولة في وقت الشدة بكلمات شوارع قوية' : 'Write a Mahragan about loyal friends and manhood in tough times with strong street words' },
              { label: t.exDiacritics, text: language === 'ar' ? 'انا رحت الشغل الصبح بدري وكان الجو برد جدا ومفيش مواصلات' : 'I went to work early in the morning, it was very cold and no transportation' },
              { label: t.exPrompt, text: language === 'ar' ? 'عايز برومبت لمهرجان شعبي مصري قوي فيه طبلة وكهربا' : 'I want a prompt for a strong Egyptian Shaabi festival with tabla and electro' }
            ].map((ex, i) => (
              <button 
                key={i} 
                onClick={() => setInputText(ex.text)}
                className={`text-xs ${darkMode ? 'bg-slate-800/50 hover:bg-slate-700 text-slate-300 border-slate-700/50' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'} px-3 py-1.5 rounded-full transition-colors border min-h-[32px]`}
              >
                {ex.label}
              </button>
            ))}
          </div>

          {/* Action Buttons Grid */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4">
            <button 
              onClick={toggleListening}
              className={`col-span-1 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border-2 min-h-[56px] ${
                isListening 
                ? 'bg-red-500/20 border-red-500 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/30'
              }`}
              aria-label={isListening ? t.stopRecording : t.startRecording}
            >
              {isListening ? <MicOff size={24} /> : <Mic size={24} />}
              <span className="text-sm">{isListening ? t.stopRecording : t.startRecording}</span>
            </button>

            <button 
              onClick={handleTashkeelOnly}
              disabled={isLoading || !inputText.trim()}
              className="col-span-1 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20 min-h-[56px]"
            >
              <Feather size={18} /> {t.diacriticsBtn}
            </button>

            <button 
              onClick={handleSpellCheckAndSpeak}
              disabled={isLoading || !inputText.trim()}
              className="col-span-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20 min-h-[56px]"
            >
              <Volume2 size={18} /> {t.correctBtn}
            </button>

            <button 
              onClick={handleGenerateMusicPrompt}
              disabled={isLoading || !inputText.trim()}
              className="col-span-1 py-3.5 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-amber-500/20 min-h-[56px]"
            >
              <Headphones size={18} /> {t.sunoPromptBtn}
            </button>

            <button 
              onClick={handleAnalyzeLyrics}
              disabled={isLoading || (!inputText.trim() && !outputResult.trim())}
              className="col-span-1 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-purple-500/20 min-h-[56px]"
            >
              <Music size={18} /> {t.analyzeLyricsBtn}
            </button>

            <button 
              onClick={handleGenerateSong}
              disabled={isLoading || !inputText.trim()}
              className="col-span-1 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-50 transition-all min-h-[56px]"
            >
              <Sparkles size={18} /> {t.composeBtn}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className={`p-4 ${darkMode ? 'bg-red-900/30 border-red-500/30 text-red-400' : 'bg-red-50 border-red-200 text-red-600'} border rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in duration-300`}>
            <AlertCircle size={20} className="shrink-0" />
            <span className="text-sm font-bold">{error}</span>
          </div>
        )}

        {/* Output Area */}
        {(outputResult || isLoading) && (
          <div ref={outputRef} className={`${darkMode ? 'bg-[#121217] border-slate-800 shadow-indigo-500/10' : 'bg-white border-slate-200 shadow-slate-200'} rounded-3xl border shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500 transition-all`}>
            
            <div className={`${darkMode ? 'bg-[#09090b] border-slate-800' : 'bg-slate-50 border-slate-200'} p-4 md:px-6 border-b flex items-center justify-between sticky top-0 z-20`}>
              <div className="flex items-center gap-2">
                <PlaySquare size={20} className="text-indigo-400" />
                <span className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{t.finalResult}</span>
              </div>
              <div className="flex gap-2">
                {(outputType === 'spellcheck' || outputType === 'tashkeel') && !isLoading && (
                  <button 
                    onClick={() => speakText(outputResult)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold ${darkMode ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' : 'bg-emerald-100 text-emerald-600 border-emerald-200 hover:bg-emerald-200'} border transition-all min-h-[44px]`}
                    aria-label={t.speakBtn}
                  >
                    <Volume2 size={18} /> {t.speakBtn}
                  </button>
                )}
                <button 
                  onClick={copyToClipboard}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 min-h-[44px] ${
                    copyStatus 
                    ? (darkMode ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-indigo-100 text-indigo-600 border border-indigo-200')
                    : (darkMode ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700')
                  }`}
                  aria-label={t.copy}
                >
                  {copyStatus ? <><Check size={18} /> <span className="hidden md:inline">{t.copied}</span></> : <><Copy size={18} /> <span className="hidden md:inline">{t.copy}</span></>}
                </button>
                <button 
                  onClick={downloadOutput}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${darkMode ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'} transition-all duration-300 min-h-[44px]`}
                  aria-label="Download TXT"
                >
                  <Download size={18} /> <span className="hidden md:inline">TXT</span>
                </button>
                <button 
                  onClick={downloadOutputDocx}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${darkMode ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30 hover:bg-indigo-600/30' : 'bg-indigo-100 text-indigo-600 border-indigo-200 hover:bg-indigo-200'} border transition-all duration-300 min-h-[44px]`}
                  aria-label="Download DOCX"
                >
                  <Download size={18} /> <span className="hidden md:inline">DOCX</span>
                </button>
                <button 
                  onClick={() => setOutputResult('')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${darkMode ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'} border transition-all duration-300 min-h-[44px]`}
                  aria-label={t.close}
                >
                  <X size={18} /> <span className="hidden md:inline">{t.close}</span>
                </button>
              </div>
            </div>
            
            <div className={`p-6 md:p-8 ${darkMode ? 'bg-gradient-to-b from-[#121217] to-[#0a0a0f]' : 'bg-white'}`}>
              {isLoading ? (
                <LoadingIndicator 
                  type={outputType}
                  task={
                    outputType === 'song' ? t.loadingComposing :
                    outputType === 'tashkeel' ? t.loadingDiacritics :
                    outputType === 'spellcheck' ? t.loadingCorrecting :
                    outputType === 'analysis' ? t.loadingAnalyzing :
                    t.loadingProcessing
                  } 
                />
              ) : (
                <div className={`text-[1.3rem] md:text-[1.5rem] leading-[2.2] text-right font-arabic ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  <VirtualizedOutput text={outputResult} type={outputType} />
                </div>
              )}
            </div>
            
            {outputType === 'song' && (
              <div className={`p-4 ${darkMode ? 'bg-indigo-950/20 border-indigo-900/30 text-indigo-300/80' : 'bg-indigo-50 border-indigo-100 text-indigo-600/80'} border-t flex items-start gap-3`}>
                <Info size={18} className="shrink-0 mt-0.5" />
                <p className="text-xs md:text-sm font-medium leading-relaxed">
                  <strong className={darkMode ? 'text-indigo-300' : 'text-indigo-700'}>{t.note}</strong> {t.noteText}
                </p>
              </div>
            )}
          </div>
        )}

        {/* History Section */}
        {history.length > 0 && (
          <div className="mt-8 border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'} flex items-center gap-2`}>
                <HistoryIcon size={20} /> {language === 'ar' ? 'السجل الأخير' : 'Recent History'}
              </h3>
              <button 
                onClick={() => setHistory([])}
                className="text-xs text-red-400 hover:text-red-500 font-bold"
              >
                {language === 'ar' ? 'مسح السجل' : 'Clear History'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setInputText(item.input);
                    setOutputResult(item.output);
                    setOutputType(item.type);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`text-right p-3 rounded-xl border transition-all ${
                    darkMode ? 'bg-[#1a1a24] border-slate-800 hover:border-indigo-500/50' : 'bg-white border-slate-200 hover:border-indigo-400'
                  } group`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      darkMode ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      {item.type}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(item.timestamp).toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US')}
                    </span>
                  </div>
                  <p className={`text-xs font-bold truncate ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    {item.input}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Pacifico&family=Noto+Sans+Arabic:wght@400;700;900&display=swap');
        
        .font-arabic { font-family: 'Noto Sans Arabic', sans-serif; }
        .font-ruqaa { font-family: 'Aref Ruqaa', serif; }
        .font-pacifico { font-family: 'Pacifico', cursive; }
        
        .neon-ar {
          color: #fff;
          text-shadow: 
            0 0 7px #fff,
            0 0 10px #fff,
            0 0 21px var(--accent-primary),
            0 0 42px var(--accent-primary);
        }
        
        .neon-en {
          color: #fff;
          text-shadow: 
            0 0 5px #fff, 
            0 0 10px #fff, 
            0 0 20px var(--accent-primary);
        }

        ::selection { background: var(--accent-primary); color: white; }
        textarea:focus, input:focus { outline: none; }
      `}} />
    </div>
  );
};

export default App;
