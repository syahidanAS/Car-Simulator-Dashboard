import React, { useRef, useState } from 'react';
import { Upload, Sparkles } from 'lucide-react';

interface MusicUploaderProps {
  onAddFiles: (files: FileList | File[]) => Promise<void>;
  onAddSynthTestTrack: () => Promise<void>;
}

export const MusicUploader: React.FC<MusicUploaderProps> = ({
  onAddFiles,
  onAddSynthTestTrack,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void onAddFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-lg border border-dashed p-2.5 text-center transition-colors ${
          isDragging
            ? 'border-[#e11d2a] bg-[#e11d2a]/10'
            : 'border-white/15 bg-[#0a0b0e] hover:border-white/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void onAddFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />

        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-1.5 px-2.5 rounded bg-[#151821] hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-zinc-200 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-[#e11d2a]" />
            <span>Upload MP3 / WAV / OGG</span>
          </button>

          <button
            type="button"
            onClick={() => void onAddSynthTestTrack()}
            title="Synthesize an original royalty-free WAV driving track in browser"
            className="py-1.5 px-2.5 rounded bg-[#151821] hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-amber-300 flex items-center justify-center gap-1 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Synth Track</span>
          </button>
        </div>
        <p className="text-[10px] text-zinc-500 mt-1">
          Drag & drop local audio files here
        </p>
      </div>
    </div>
  );
};

