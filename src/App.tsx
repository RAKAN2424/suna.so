import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Copy, Trash2, Music, Sparkles, 
  RefreshCw, Check, AlertCircle, PlaySquare, Info, 
  Feather, Volume2, Search, BookOpen,
  Download, Save, FolderOpen, X, Headphones,
  Upload, FileAudio, Moon, Sun, Languages
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { useVirtualizer } from '@tanstack/react-virtual';

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
  const [genre, setGenre] = useState('rap_egy'); 
  const [darkMode, setDarkMode] = useState(true);
  const [language, setLanguage] = useState('ar');

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
      recognitionRef.current.lang = 'ar-EG'; 

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
        setError("عفواً، الميكروفون غير مدعوم أو يحتاج لإذن في هذا المتصفح.");
      }
    }
  };

  const speakText = (textToSpeak: string) => {
    if (!window.speechSynthesis) {
      setError("متصفحك لا يدعم خاصية النطق الصوتي.");
      return;
    }
    window.speechSynthesis.cancel();
    
    let cleanText = textToSpeak.replace(/\[.*?\]/g, '').trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ar-EG'; 
    
    const voices = window.speechSynthesis.getVoices();
    const arabicVoice = voices.find(v => v.lang.includes('ar-EG')) || voices.find(v => v.lang.includes('ar'));
    if (arabicVoice) {
      utterance.voice = arabicVoice;
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
    throw new Error("فشل الاتصال بالخادم.");
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
      rap_egy: "راب/تراب مصري. كلمات قوية، قوافي حادة سريعة.",
      pop_egy: "بوب مصري شبابي. قوافي ناعمة، مشاعر واضحة جذابة.",
      shaabi: "مهرجانات شعبي. طاقة متفجرة، كلمات شعبية للشارع.",
      khaliji: "خليجي. إيقاع خليجي أصيل، كلمات فخمة ومعبرة.",
      romantic: "رومانسي هادئ. مشاعر عميقة، كلمات رقيقة ومؤثرة."
    };

    const sysPrompt = `أنت كاتب أغاني محترف للذكاء الاصطناعي.
    1. الأسلوب: ${genreInstructions[genre]}
    2. استخدم العامية المصرية حصراً مع التشكيل الإيقاعي الدقيق (سكون، شدة، إلخ).
    3. المستخدم سيعطيك كلمات خام أو أفكار. مهمتك أن تحولها وتؤلف منها أغنية متكاملة واحترافية جداً.
    4. **قانون صارم (لا تخالفه أبداً):** يجب أن تخرج الأغنية *حصرياً* بهذا الترتيب والتقسيم المسبق. لا تضف أي فواصل أخرى، استبدل القوسين (اكتب الكلمات هنا) بكلمات الأغنية الاحترافية:

${metaTags}

[Intro]
(اكتب الكلمات هنا)

[Verse 1]
(اكتب الكلمات هنا)

[Chorus]
(اكتب الكلمات هنا - اجعله يعلق في الذهن)

[Verse 2]
(اكتب الكلمات هنا)

[Chorus]
(اكتب الكلمات هنا)

[Outro]
(اكتب الكلمات هنا)
    
    أخرج النص فقط بدون أي تعليقات خارجية أو مقدمات.`;

    try {
      const result = await callAI(`قم بترتيب وتأليف الأغنية باحترافية بناءً على: "${inputText}"`, sysPrompt);
      setOutputResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTashkeelOnly = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true); setError(null); setOutputResult(''); setOutputType('tashkeel');

    const sysPrompt = `أنت خبير لغوي متخصص في الفونوتيكا (علم الأصوات) للهجة المصرية. 
    مهمتك: وضع التشكيل (الحركات) الكامل على النص ليعكس النطق العامي المصري الحقيقي بدقة احترافية. 
    ركز على: 
    1. نطق الجيم القاهرية (G). 
    2. نطق القاف كهمزة أو حسب السياق العامي. 
    3. التسكين الصحيح في أواخر الكلمات. 
    4. إدغام الحروف والوصل بين الكلمات كما ينطقها المصريون في الشارع.
    لا تغير الكلمات، فقط شكلها لتنطق مصرية 100%. أخرج النص المشكل فقط.`;

    try {
      const result = await callAI(`شكّل هذا النص بالعامية المصرية بدقة صوتية: "${inputText}"`, sysPrompt);
      setOutputResult(result);
      speakText(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpellCheckAndSpeak = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true); setError(null); setOutputResult(''); setOutputType('spellcheck');

    const sysPrompt = `أنت المصحح اللغوي الأول والخبير الصوتي للعامية المصرية.
    قم بتصحيح الأخطاء الإملائية في النص المدخل مع الحفاظ الكامل على روح العامية (لا تحولها للفصحى). 
    ضع تشكيلاً كاملاً ودقيقاً يوجه القارئ (أو محرك النطق) لنطق النص بلهجة مصرية أصلية وصحيحة (phonetic diacritics).
    أخرج النص المصحح والمشكل فقط.`;

    try {
      const result = await callAI(`صحح هذا النص إملائياً وشكله للعامية: "${inputText}"`, sysPrompt);
      setOutputResult(result);
      speakText(result); 
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
      const result = await callAI(`هات كل احتمالات التشكيل للكلمة دي: "${searchWord}"`, sysPrompt, false, true);
      const parsedData = JSON.parse(result);
      setWordSuggestions(parsedData);
    } catch (err: any) {
      setWordSuggestions([{ word: "خطأ", meaning: "حدث خطأ أثناء جلب التشكيلات، حاول مجدداً." }]);
    } finally {
      setIsSearchingWord(false);
    }
  };

  const handleGenerateMusicPrompt = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true); setError(null); setOutputResult(''); setOutputType('music_prompt');

    const sysPrompt = `أنت خبير في هندسة البرومبتات (Prompt Engineering) لأدوات توليد الموسيقى بالذكاء الاصطناعي مثل Suno AI و Udio.
    مهمتك: تحويل فكرة المستخدم أو نوع الموسيقى الذي يختاره إلى برومبت احترافي جداً باللغة الإنجليزية (لأن هذه الأدوات تفهم الإنجليزية بشكل أفضل في وصف الأنماط).
    
    إذا طلب المستخدم "شعبي" أو "مهرجانات"، استخدم كلمات مفتاحية مثل:
    - Egyptian Mahraganat, Street Electro, Auto-tuned vocals, Heavy Darbuka beats, Synthesizer leads, High energy, Cairo street vibe, 140-150 BPM.
    - Egyptian Shaabi, Traditional instruments (Accordion, Kawala), Wedding vibe, Rhythmic, Soulful street singing.
    
    يجب أن يتضمن البرومبت:
    1. [Style]: وصف دقيق للنمط الموسيقي.
    2. [Instruments]: الآلات المستخدمة.
    3. [Mood/Atmosphere]: الحالة المزاجية.
    4. [BPM/Tempo]: السرعة.
    
    أخرج النتيجة كبرومبت جاهز للنسخ واللصق في Suno/Udio. أضف شرحاً بسيطاً بالعربية لما يفعله هذا البرومبت.`;

    try {
      const result = await callAI(`اكتب برومبت موسيقي احترافي لـ Suno بناءً على: "${inputText}" ونوع "${genre}"`, sysPrompt);
      setOutputResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0]);
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
      const result = await callAI(`هات كلمات لها نفس قافية: "${rhymeWord}"`, sysPrompt, false, true);
      const parsedData = JSON.parse(result);
      setOutputResult(`القوافي المقترحة لـ "${rhymeWord}":\n${parsedData.rhymes.join('\n')}`);
      setOutputType('rhymes');
    } catch (err: any) {
      setError("حدث خطأ أثناء البحث عن القوافي.");
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
      const result = await callAI(`أعد صياغة هذا السطر: "${lineToRewrite}"\n\nمع الحفاظ على القافية والوزن في سياق هذه الأغنية: "${inputText}"`, sysPrompt);
      setOutputResult(`السطر الجديد:\n${result}`);
      setOutputType('rewrite');
    } catch (err: any) {
      setError("حدث خطأ أثناء إعادة صياغة السطر.");
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
        sysPrompt = `أنت خبير في تفريغ الصوتيات وتشكيلها بالعامية المصرية.
        مهمتك: استمع للملف الصوتي، واكتب الكلام الموجود فيه بدقة إملائية عالية، ثم ضع عليه التشكيل (الحركات) الكامل ليعكس النطق العامي المصري الحقيقي (التسكين، نطق الجيم، إلخ).
        أخرج النص المفرغ والمشكل فقط.`;
        promptText = "قم بتفريغ هذا الصوت واكتبه بالعامية المصرية مع التشكيل الدقيق.";
      } else if (mode === 'analyze_music') {
        sysPrompt = `أنت خبير موسيقي ومهندس برومبتات محترف لأدوات الذكاء الاصطناعي مثل Suno AI.
        مهمتك هي الاستماع للملف الصوتي المرفق والقيام بالتالي:
        1. تفريغ كلمات الأغنية أو المقطع الصوتي باحترافية والتعرف على اللغة.
        2. تحليل الموسيقى بدقة (النوع الموسيقي Genre، الآلات Instruments، الحالة المزاجية Vibe).
        3. كتابة برومبت قوي جداً باللغة الإنجليزية مخصص لموقع Suno AI لتوليد أغنية بنفس الروح والنمط الموسيقي.
        
        أخرج النتيجة بتنسيق واضح ومقسم إلى:
        - الكلمات المفرغة (مع ذكر اللغة)
        - التحليل الموسيقي
        - [Suno Prompt: اكتب البرومبت الإنجليزي هنا]`;
        promptText = "قم بتحليل هذا المقطع الصوتي، واكتب كلماته، واستخرج نوع الموسيقى واكتب برومبت Suno.";
      } else {
        sysPrompt = `أنت خبير في تفريغ الصوتيات بجميع اللغات واللهجات.
        مهمتك: استمع للملف الصوتي، تعرف على لغته أو لهجته، واكتب الكلام بدقة إملائية.
        ثم ضع التشكيل المناسب حسب لغة الأغنية أو المقطع الصوتي.
        أخرج النص المفرغ والمشكل فقط.`;
        promptText = "قم بتفريغ هذا الصوت واكتبه مع التشكيل المناسب للغته.";
      }

      const result = await callAI(promptText, sysPrompt, false, false, audioPart);
      setOutputResult(result);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء معالجة الصوت.");
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

  const LoadingIndicator = ({ task }: { task: string }) => (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <p className={`${darkMode ? 'text-indigo-300' : 'text-indigo-600'} font-bold animate-pulse`}>{task}...</p>
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
                  alt="Hafiz Logo" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-end gap-2">
                  <h1 className={`text-4xl md:text-6xl font-ruqaa ${darkMode ? 'neon-ar' : 'text-indigo-600'} leading-none pb-2`}>
                    {language === 'ar' ? 'حَافِظ' : 'HAFIZ'}
                  </h1>
                  <span className={`text-sm md:text-lg font-arabic ${darkMode ? 'text-sky-300/80' : 'text-sky-600'} mb-3 font-light italic`}>
                    {language === 'ar' ? 'بِالْعَامِّيَّة' : 'In Slang'}
                  </span>
                </div>
                <div className="h-0.5 w-16 bg-gradient-to-l from-sky-500 to-transparent rounded-full hidden md:block shadow-[0_0_8px_rgba(56,189,248,0.8)] mb-2"></div>
              </div>
            </div>
            <p className={`text-sm md:text-base ${darkMode ? 'text-slate-300 border-slate-800/50' : 'text-slate-600 border-slate-200'} font-bold tracking-wide leading-relaxed border-t pt-3`}>
              {language === 'ar' ? 'المتخصص الأول في التشكيل والنطق المصري الاحترافي' : 'The first specialist in professional Egyptian diacritics and pronunciation'}
            </p>
          </div>
          
          <div className="flex flex-col gap-4 w-full md:w-auto">
            <div className="flex justify-end gap-2">
              <button 
                onClick={toggleLanguage}
                className={`p-2.5 rounded-xl ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white' : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-indigo-600'} border transition-all duration-300 shadow-sm`}
                title={language === 'ar' ? 'Switch to English' : 'التحويل للعربية'}
              >
                <Languages size={20} />
              </button>
              <button 
                onClick={toggleDarkMode}
                className={`p-2.5 rounded-xl ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white' : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-indigo-600'} border transition-all duration-300 shadow-sm`}
                title={darkMode ? 'Light Mode' : 'Dark Mode'}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
            
            <div className={`flex flex-wrap justify-center ${darkMode ? 'bg-[#09090b] border-slate-800' : 'bg-slate-50 border-slate-200'} rounded-xl p-1 border w-full md:w-auto gap-1`}>
               {[
                 { id: 'rap_egy', label: language === 'ar' ? 'راب/تراب' : 'Rap/Trap' },
                 { id: 'pop_egy', label: language === 'ar' ? 'بوب' : 'Pop' },
                 { id: 'shaabi', label: language === 'ar' ? 'مهرجانات' : 'Shaabi' },
                 { id: 'khaliji', label: language === 'ar' ? 'خليجي' : 'Khaliji' },
                 { id: 'romantic', label: language === 'ar' ? 'رومانسي' : 'Romantic' }
               ].map(g => (
                 <button 
                    key={g.id} 
                    onClick={() => setGenre(g.id)}
                    className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all duration-300 ${
                      genre === g.id 
                      ? (darkMode ? 'bg-slate-800 text-indigo-400 shadow-md' : 'bg-white text-indigo-600 shadow-md border border-slate-200')
                      : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600')
                    }`}
                  >
                   {g.label}
                 </button>
               ))}
            </div>
          </div>
        </header>

        {/* Word Inspector Card */}
        <div className={`${darkMode ? 'bg-[#1a1a24] border-indigo-900/50 shadow-indigo-500/10' : 'bg-white border-slate-200 shadow-slate-200'} rounded-2xl p-4 border shadow-lg transition-all duration-500`}>
          <div className="flex flex-col md:flex-row gap-3 items-center">
            <div className={`flex items-center gap-2 ${darkMode ? 'text-indigo-300' : 'text-indigo-600'} w-full md:w-auto font-bold text-sm`}>
              <Search size={18} />
              <span>{language === 'ar' ? 'مفتش التشكيل:' : 'Diacritics Inspector:'}</span>
            </div>
            <div className="flex w-full gap-2 relative">
              <input 
                type="text"
                value={searchWord}
                onChange={(e) => setSearchWord(e.target.value)}
                placeholder={language === 'ar' ? 'اكتب كلمة واحدة هنا لجلب كل احتمالات تشكيلها ونطقها...' : 'Type a single word to get all diacritics and pronunciation...'}
                className={`flex-1 ${darkMode ? 'bg-[#09090b] border-slate-700 text-white focus:ring-indigo-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-indigo-400'} border rounded-xl px-4 py-2 text-sm focus:ring-1 transition-all`}
              />
              <button 
                onClick={handleWordSearch}
                disabled={isSearchingWord || !searchWord.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 transition-all flex items-center gap-2 shadow-md hover:shadow-indigo-500/40"
              >
                {isSearchingWord ? <RefreshCw size={16} className="animate-spin" /> : <BookOpen size={16} />}
                {language === 'ar' ? 'هات التشكيلات' : 'Get Diacritics'}
              </button>
            </div>
          </div>
          <AnimatePresence>
            {wordSuggestions && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
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
                          className={`p-2.5 ${darkMode ? 'bg-indigo-900/30 text-indigo-300 hover:bg-indigo-600' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-600'} rounded-xl hover:text-white transition-colors flex-shrink-0`}
                          title={language === 'ar' ? 'استمع للنطق' : 'Listen'}
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
                      <h4 className={`text-sm font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'} mb-2`}>{language === 'ar' ? 'مرادفات:' : 'Synonyms:'}</h4>
                      <div className="flex flex-wrap gap-2">
                        {wordSuggestions.synonyms.map((s: string, i: number) => (
                          <span key={i} className={`px-2 py-1 ${darkMode ? 'bg-emerald-900/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'} rounded text-xs`}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {wordSuggestions.antonyms && wordSuggestions.antonyms.length > 0 && (
                    <div className={`p-4 ${darkMode ? 'bg-[#09090b] border-slate-800' : 'bg-slate-50 border-slate-200'} rounded-xl border`}>
                      <h4 className={`text-sm font-bold ${darkMode ? 'text-red-400' : 'text-red-600'} mb-2`}>{language === 'ar' ? 'أضداد:' : 'Antonyms:'}</h4>
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
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center gap-2 ${darkMode ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'} px-4 py-2 rounded-xl text-sm font-bold transition-colors`}
                >
                  <Upload size={18} /> {audioFile ? (language === 'ar' ? 'تغيير الملف الصوتي' : 'Change Audio') : (language === 'ar' ? 'رفع ملف صوتي (أغنية/مقطع)' : 'Upload Audio')}
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleAudioUpload} 
                  accept="audio/*" 
                  className="hidden" 
                />
                {audioFile && (
                  <span className={`text-xs ${darkMode ? 'text-emerald-400' : 'text-emerald-600'} font-bold flex items-center gap-1`}>
                    <Check size={14} /> {audioFile.name}
                  </span>
                )}
              </div>
              
              {audioFile && (
                <div className="flex flex-wrap gap-2 w-full md:w-auto mt-3 md:mt-0">
                  <button 
                    onClick={() => processAudio('general')}
                    disabled={isLoading}
                    className={`flex-1 md:flex-none flex items-center justify-center gap-2 ${darkMode ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border-blue-500/30' : 'bg-blue-100 text-blue-600 hover:bg-blue-200 border-blue-200'} border px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50`}
                  >
                    <FileAudio size={18} /> {language === 'ar' ? 'تفريغ (عام)' : 'Transcribe (General)'}
                  </button>
                  <button 
                    onClick={() => processAudio('egyptian')}
                    disabled={isLoading}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-lg shadow-indigo-500/20"
                  >
                    <FileAudio size={18} /> {language === 'ar' ? 'تفريغ (مصري)' : 'Transcribe (Egyptian)'}
                  </button>
                  <button 
                    onClick={() => processAudio('analyze_music')}
                    disabled={isLoading}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-lg shadow-amber-500/20"
                  >
                    <Music size={18} /> {language === 'ar' ? 'تحليل وبرومبت Suno' : 'Analyze & Suno Prompt'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* New Tools Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="flex gap-2">
              <input 
                type="text"
                value={rhymeWord}
                onChange={(e) => setRhymeWord(e.target.value)}
                placeholder={language === 'ar' ? 'كلمة للبحث عن قافية...' : 'Word for rhyme search...'}
                className={`flex-1 ${darkMode ? 'bg-[#09090b] border-slate-800 text-slate-200 focus:ring-indigo-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-indigo-400'} border rounded-xl p-3 text-sm focus:ring-1 transition-all`}
              />
              <button 
                onClick={handleFindRhymes}
                disabled={isLoading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-md hover:shadow-indigo-500/30"
              >
                {language === 'ar' ? 'قوافي' : 'Rhymes'}
              </button>
            </div>
            <div className="flex gap-2">
              <input 
                type="text"
                value={lineToRewrite}
                onChange={(e) => setLineToRewrite(e.target.value)}
                placeholder={language === 'ar' ? 'سطر لإعادة الصياغة...' : 'Line to rewrite...'}
                className={`flex-1 ${darkMode ? 'bg-[#09090b] border-slate-800 text-slate-200 focus:ring-indigo-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-indigo-400'} border rounded-xl p-3 text-sm focus:ring-1 transition-all`}
              />
              <button 
                onClick={handleRewriteLine}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-md hover:shadow-emerald-500/30"
              >
                {language === 'ar' ? 'إعادة صياغة' : 'Rewrite'}
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center mb-3">
            <label className={`text-sm font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'} flex items-center gap-2`}>
               {language === 'ar' ? 'النص الأساسي (تحدث أو اكتب):' : 'Main Text (Speak or Type):'}
            </label>
            <div className="flex gap-2">
              <button onClick={loadInput} className={`${darkMode ? 'text-slate-600 hover:text-indigo-400' : 'text-slate-400 hover:text-indigo-600'} transition-colors p-1`} title={language === 'ar' ? 'استرجاع المحفوظ' : 'Load Saved'}>
                <FolderOpen size={18} />
              </button>
              <button onClick={saveInput} className={`${darkMode ? 'text-slate-600 hover:text-emerald-400' : 'text-slate-400 hover:text-emerald-600'} transition-colors p-1`} title={language === 'ar' ? 'حفظ النص' : 'Save Text'}>
                <Save size={18} />
              </button>
              <button onClick={() => setInputText('')} className={`${darkMode ? 'text-slate-600 hover:text-red-400' : 'text-slate-400 hover:text-red-600'} transition-colors p-1`} title={language === 'ar' ? 'مسح' : 'Clear'}>
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={language === 'ar' ? 'اكتب هنا فكرتك، وسيتم تحويلها وترتيبها لأغنية احترافية بمجرد الضغط على تأليف...' : 'Write your idea here, and it will be transformed into a professional song...'}
            className={`w-full h-32 ${darkMode ? 'bg-[#09090b] border-slate-800 text-slate-200 focus:ring-indigo-500 placeholder:text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-indigo-400 placeholder:text-slate-400'} border rounded-2xl p-4 text-lg focus:ring-1 focus:border-indigo-500 resize-none font-arabic transition-all`}
          />

          {/* Example Prompts */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'} py-1 font-bold`}>{language === 'ar' ? 'أمثلة:' : 'Examples:'}</span>
            {[
              { label: language === 'ar' ? 'أغنية: كفاح القاهرة' : 'Song: Cairo Struggle', text: 'قصة شاب بيكافح في زحمة القاهرة وعنده طموح كبير' },
              { label: language === 'ar' ? 'تشكيل: نص عامي' : 'Diacritics: Slang Text', text: 'انا رحت الشغل الصبح بدري وكان الجو برد جدا ومفيش مواصلات' },
              { label: language === 'ar' ? 'تصحيح: أخطاء إملائية' : 'Correction: Spelling Errors', text: 'امبارح روحت السنما وشفت فلم حلو اوي بس الكرسي كان مش مريح' },
              { label: language === 'ar' ? 'برومبت: مهرجان شعبي' : 'Prompt: Shaabi Festival', text: 'عايز برومبت لمهرجان شعبي مصري قوي فيه طبلة وكهربا' }
            ].map((ex, i) => (
              <button 
                key={i} 
                onClick={() => setInputText(ex.text)}
                className={`text-xs ${darkMode ? 'bg-slate-800/50 hover:bg-slate-700 text-slate-300 border-slate-700/50' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'} px-3 py-1.5 rounded-full transition-colors border`}
              >
                {ex.label}
              </button>
            ))}
          </div>

          {/* Action Buttons Grid */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4">
            <button 
              onClick={toggleListening}
              className={`col-span-1 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border-2 ${
                isListening 
                ? 'bg-red-500/20 border-red-500 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/30'
              }`}
            >
              {isListening ? <MicOff size={24} /> : <Mic size={24} />}
              <span className="text-sm">{isListening ? (language === 'ar' ? 'إيقاف التسجيل' : 'Stop Recording') : (language === 'ar' ? 'بدء التسجيل الصوتي' : 'Start Recording')}</span>
            </button>

            <button 
              onClick={handleTashkeelOnly}
              disabled={isLoading || !inputText.trim()}
              className="col-span-1 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20"
            >
              <Feather size={18} /> {language === 'ar' ? 'تشكيل ونطق' : 'Diacritics'}
            </button>

            <button 
              onClick={handleSpellCheckAndSpeak}
              disabled={isLoading || !inputText.trim()}
              className="col-span-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Volume2 size={18} /> {language === 'ar' ? 'تصحيح ونطق' : 'Correct'}
            </button>

            <button 
              onClick={handleGenerateMusicPrompt}
              disabled={isLoading || !inputText.trim()}
              className="col-span-1 py-3.5 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-amber-500/20"
            >
              <Headphones size={18} /> {language === 'ar' ? 'برومبت Suno' : 'Suno Prompt'}
            </button>

            <button 
              onClick={handleGenerateSong}
              disabled={isLoading || !inputText.trim()}
              className="col-span-1 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-50 transition-all"
            >
              <Music size={18} /> {language === 'ar' ? 'تأليف أغنية' : 'Compose'}
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
                <span className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{language === 'ar' ? 'النتيجة النهائية' : 'Final Result'}</span>
              </div>
              <div className="flex gap-2">
                {(outputType === 'spellcheck' || outputType === 'tashkeel') && !isLoading && (
                  <button 
                    onClick={() => speakText(outputResult)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold ${darkMode ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' : 'bg-emerald-100 text-emerald-600 border-emerald-200 hover:bg-emerald-200'} border transition-all`}
                    title={language === 'ar' ? 'أعد النطق' : 'Re-play'}
                  >
                    <Volume2 size={18} /> {language === 'ar' ? 'إعد النطق' : 'Speak'}
                  </button>
                )}
                <button 
                  onClick={copyToClipboard}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                    copyStatus 
                    ? (darkMode ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-indigo-100 text-indigo-600 border border-indigo-200')
                    : (darkMode ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700')
                  }`}
                >
                  {copyStatus ? <><Check size={18} /> <span className="hidden md:inline">{language === 'ar' ? 'تم النسخ!' : 'Copied!'}</span></> : <><Copy size={18} /> <span className="hidden md:inline">{language === 'ar' ? 'نسخ' : 'Copy'}</span></>}
                </button>
                <button 
                  onClick={downloadOutput}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${darkMode ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'} transition-all duration-300`}
                  title={language === 'ar' ? 'تحميل كملف نصي (TXT)' : 'Download TXT'}
                >
                  <Download size={18} /> <span className="hidden md:inline">TXT</span>
                </button>
                <button 
                  onClick={downloadOutputDocx}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${darkMode ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30 hover:bg-indigo-600/30' : 'bg-indigo-100 text-indigo-600 border-indigo-200 hover:bg-indigo-200'} border transition-all duration-300`}
                  title={language === 'ar' ? 'تحميل كملف وورد (DOCX)' : 'Download DOCX'}
                >
                  <Download size={18} /> <span className="hidden md:inline">DOCX</span>
                </button>
                <button 
                  onClick={() => setOutputResult('')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${darkMode ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'} border transition-all duration-300`}
                  title={language === 'ar' ? 'إغلاق النتيجة' : 'Close Result'}
                >
                  <X size={18} /> <span className="hidden md:inline">{language === 'ar' ? 'إغلاق' : 'Close'}</span>
                </button>
              </div>
            </div>
            
            <div className={`p-6 md:p-8 ${darkMode ? 'bg-gradient-to-b from-[#121217] to-[#0a0a0f]' : 'bg-white'}`}>
              {isLoading ? (
                <LoadingIndicator task={
                  outputType === 'song' ? (language === 'ar' ? 'تأليف الأغنية' : 'Composing Song') :
                  outputType === 'tashkeel' ? (language === 'ar' ? 'جاري التشكيل' : 'Adding Diacritics') :
                  outputType === 'spellcheck' ? (language === 'ar' ? 'جاري التصحيح' : 'Correcting Text') :
                  outputType === 'analysis' ? (language === 'ar' ? 'جاري التحليل الموسيقي' : 'Analyzing Music') :
                  (language === 'ar' ? 'جاري المعالجة' : 'Processing')
                } />
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
                  <strong className={darkMode ? 'text-indigo-300' : 'text-indigo-700'}>{language === 'ar' ? 'ملاحظة:' : 'Note:'}</strong> {language === 'ar' ? 'الأكواد الخضراء في البداية هي أوامر برمجية لضبط النطق. انسخها مع الأغنية في برامج التوليد الصوتي لتحصل على أداء مصري دقيق.' : 'The green codes at the beginning are commands to adjust pronunciation. Copy them with the song into voice generation software for accurate Egyptian performance.'}
                </p>
              </div>
            )}
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
            0 0 21px #00d4ff,
            0 0 42px #00d4ff,
            0 0 82px #00d4ff,
            0 0 92px #00d4ff,
            0 0 102px #00d4ff;
        }
        
        .neon-en {
          color: #fff;
          text-shadow: 
            0 0 5px #fff, 
            0 0 10px #fff, 
            0 0 20px #00ffff, 
            0 0 40px #00ffff, 
            0 0 80px #00ffff;
        }

        body { font-family: 'Noto Sans Arabic', sans-serif; background-color: ${darkMode ? '#09090b' : '#f8fafc'}; transition: background-color 0.5s ease; }
        ::selection { background: #bc13fe; color: white; }
        textarea:focus, input:focus { outline: none; }
      `}} />
    </div>
  );
};

export default App;
