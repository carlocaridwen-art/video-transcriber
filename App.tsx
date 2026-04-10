import { useState, useRef } from "react";
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from "react-markdown";
import { 
  Upload, 
  FileVideo, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Link as LinkIcon,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MODEL_NAME = "gemini-3.1-pro-preview";

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gemini API Key is injected by the environment
  const apiKey = process.env.GEMINI_API_KEY;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024 * 1024) { // 5GB limit
        setError("Video file is too large (max 5GB).");
        return;
      }
      setVideoFile(file);
      setVideoUrl("");
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("video/")) {
      if (file.size > 5 * 1024 * 1024 * 1024) {
        setError("Video file is too large (max 5GB).");
        return;
      }
      setVideoFile(file);
      setVideoUrl("");
      setError(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(",")[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const generateTranscript = async () => {
    if (!videoFile && !videoUrl) {
      setError("Please upload a video file or provide a URL.");
      return;
    }

    if (!apiKey) {
      setError("Gemini API Key is missing.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setTranscript("");
    setProgress(5);

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      let contents: any;

      if (videoFile) {
        setProgress(10);
        // Use File API for large files instead of inlineData (Base64)
        // This is much more memory efficient and supports up to 5GB
        const uploadResult = await ai.files.upload({
          file: videoFile,
        });
        
        setProgress(30);
        
        // Wait for the file to be processed and reach ACTIVE state
        let file = await ai.files.get({ name: uploadResult.name });
        while (file.state === "PROCESSING") {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          file = await ai.files.get({ name: uploadResult.name });
        }

        if (file.state === "FAILED") {
          throw new Error("Video processing failed. Please try a different file.");
        }

        setProgress(60);
        
        contents = {
          parts: [
            {
              fileData: {
                fileUri: file.uri,
                mimeType: file.mimeType,
              },
            },
            {
              text: `Hãy xem toàn bộ video được cung cấp.
              
              Yêu cầu:
              - Nếu video bằng nhiều ngôn ngữ khác, dịch sang tiếng Anh.
              - Viết thành transcript đầy đủ, rõ ràng.
              - Mỗi câu hoặc mỗi ý phải xuống dòng riêng để dễ đọc voice.
              - Nếu có đoạn dừng dài, hãy xuống 2 dòng để tạo khoảng nghỉ rõ ràng.
              - Ưu tiên chia câu ngắn, tự nhiên để phù hợp đọc voice AI.
              - Không viết câu quá dài, ưu tiên nhịp đọc tự nhiên như người thật.
              - Không giải thích thêm.`,
            },
          ],
        };
      } else {
        // For URLs, we pass it as text.
        contents = `Hãy xem video tại URL này: ${videoUrl}.
        
        Yêu cầu:
        - Nếu video bằng nhiều ngôn ngữ khác, dịch sang tiếng Anh.
        - Viết thành transcript đầy đủ, rõ ràng.
        - Mỗi câu hoặc mỗi ý phải xuống dòng riêng để dễ đọc voice.
        - Nếu có đoạn dừng dài, hãy xuống 2 dòng để tạo khoảng nghỉ rõ ràng.
        - Ưu tiên chia câu ngắn, tự nhiên để phù hợp đọc voice AI.
        - Không viết câu quá dài, ưu tiên nhịp đọc tự nhiên như người thật.
        - Không giải thích thêm.`;
      }

      setProgress(80);
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: contents,
      });

      setProgress(95);
      const text = response.text;
      if (text) {
        setTranscript(text);
      } else {
        setError("Failed to generate transcript. The model returned an empty response.");
      }
    } catch (err: any) {
      console.error("Transcription error:", err);
      setError(err.message || "An error occurred during transcription.");
    } finally {
      setIsGenerating(false);
      setProgress(100);
    }
  };

  const downloadTranscript = () => {
    if (!transcript) return;
    const blob = new Blob([transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${videoFile?.name || "video"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setVideoFile(null);
    setVideoUrl("");
    setTranscript("");
    setError(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#212529] font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <FileVideo size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Video Transcriber</h1>
          </div>
          {transcript && (
            <button
              onClick={downloadTranscript}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm font-medium transition-all shadow-sm active:scale-95"
            >
              <Download size={16} />
              Download .txt
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Upload & Controls */}
          <div className="lg:col-span-5 space-y-6">
            <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Input Source</h2>
              
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative group cursor-pointer border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center gap-3",
                  videoFile ? "border-blue-200 bg-blue-50" : "border-gray-200 hover:border-blue-400 hover:bg-gray-50"
                )}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="video/*" 
                  className="hidden" 
                />
                
                {videoFile ? (
                  <>
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                      <CheckCircle2 size={24} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-blue-900 truncate max-w-[200px]">{videoFile.name}</p>
                      <p className="text-xs text-blue-600">{(videoFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 bg-gray-100 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600 rounded-full flex items-center justify-center transition-colors">
                      <Upload size={24} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700">Click or drag video</p>
                      <p className="text-xs text-gray-400 mt-1">MP4, MOV, WEBM (Max 5GB)</p>
                    </div>
                  </>
                )}
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-100"></span>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-400">Or use URL</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <LinkIcon size={16} />
                  </div>
                  <input
                    type="text"
                    placeholder="Paste YouTube or Video URL"
                    value={videoUrl}
                    onChange={(e) => {
                      setVideoUrl(e.target.value);
                      setVideoFile(null);
                    }}
                    className="block w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={generateTranscript}
                    disabled={isGenerating || (!videoFile && !videoUrl)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all active:scale-[0.98]",
                      isGenerating || (!videoFile && !videoUrl)
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200"
                    )}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate Transcript"
                    )}
                  </button>
                  
                  {(videoFile || videoUrl || transcript) && (
                    <button
                      onClick={clearAll}
                      className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      title="Clear all"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl flex gap-2 text-red-600 text-sm"
                >
                  <AlertCircle size={18} className="shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}
            </section>

            {isGenerating && (
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase">Processing</span>
                  <span className="text-xs font-bold text-blue-600">{progress}%</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-blue-600"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-3 text-center italic">
                  Gemini is analyzing the video. This may take a moment depending on the length.
                </p>
              </section>
            )}
          </div>

          {/* Right Column: Result */}
          <div className="lg:col-span-7">
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col min-h-[500px]">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Transcript Result</h2>
                {transcript && (
                   <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase">Ready</span>
                )}
              </div>
              
              <div className="flex-1 p-6 overflow-y-auto max-h-[700px]">
                <AnimatePresence mode="wait">
                  {transcript ? (
                    <motion.div
                      key="transcript"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="prose prose-sm max-w-none prose-slate prose-headings:text-gray-900 prose-p:text-gray-700 prose-p:leading-relaxed"
                    >
                      <ReactMarkdown>{transcript}</ReactMarkdown>
                    </motion.div>
                  ) : isGenerating ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-full flex flex-col items-center justify-center text-gray-400 gap-4 py-20"
                    >
                      <div className="relative">
                        <Loader2 size={48} className="animate-spin text-blue-200" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <FileVideo size={20} className="text-blue-500" />
                        </div>
                      </div>
                      <p className="text-sm font-medium animate-pulse">Transcribing your video...</p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-full flex flex-col items-center justify-center text-gray-300 gap-4 py-20"
                    >
                      <FileVideo size={64} strokeWidth={1} />
                      <div className="text-center">
                        <p className="text-sm font-medium">No transcript generated yet</p>
                        <p className="text-xs mt-1">Upload a video to get started</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-4 py-12 text-center">
        <p className="text-xs text-gray-400">
          Powered by Google Gemini 3.1 Pro • Built for AI Studio
        </p>
      </footer>
    </div>
  );
}
