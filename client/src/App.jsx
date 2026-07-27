import React, { useState, useEffect, useRef } from 'react';

const BACKEND_URL = 'http://localhost:5000';

const TEMPLATES = [
  {
    id: 'word_pop',
    name: 'Word Pop',
    type: 'KARAOKE (BOX)',
    previewText1: 'OLD VIDEO ',
    previewText2: 'GAMES',
  },
  {
    id: 'steady_bold',
    name: 'Steady Bold',
    type: 'KARAOKE (TEXT)',
    previewText1: 'SLOW AND ',
    previewText2: 'STEADY',
  },
  {
    id: 'cyber_glow',
    name: 'Cyber Glow',
    type: 'KARAOKE (GLOW)',
    previewText1: 'NEON ',
    previewText2: 'CYBER',
  }
];

const PALETTE_COLORS = [
  { hex: '#ff2a5f', name: 'Pink/Red' },
  { hex: '#00f0ff', name: 'Cyan' },
  { hex: '#00ff3c', name: 'Green' },
  { hex: '#ffcc00', name: 'Yellow' },
  { hex: '#ff00f0', name: 'Magenta' },
];

const CAPTION_POSITIONS = [
  { value: 'bottom', label: 'Bottom (default)' },
  { value: 'middle', label: 'Middle' },
  { value: 'top', label: 'Top' },
  { value: 'custom', label: 'Custom position' },
];

const CAPTION_PRESETS = {
  bottom: { x: 540, y: 1540 },
  middle: { x: 540, y: 960 },
  top: { x: 540, y: 260 },
};

const VIDEO_PREVIEW_WIDTH = 1080;
const VIDEO_PREVIEW_HEIGHT = 1920;

function App() {
  const [generationMode, setGenerationMode] = useState('youtube'); // 'youtube' or 'upload'
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [clipLength, setClipLength] = useState(45);
  const [numberOfShorts, setNumberOfShorts] = useState(5);
  const [model, setModel] = useState('llama-3.1-8b-instant');
  const [featureMode, setFeatureMode] = useState('shorts'); // 'shorts' or 'captions_only'
  const [stylePreset, setStylePreset] = useState('word_pop');
  const [highlightColor, setHighlightColor] = useState('#ff2a5f');
  const [captionPosition, setCaptionPosition] = useState('bottom');
  const [captionPosX, setCaptionPosX] = useState(540);
  const [captionPosY, setCaptionPosY] = useState(1540);
  const [burnHook, setBurnHook] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [clips, setClips] = useState([]);
  const [isDraggingCaption, setIsDraggingCaption] = useState(false);

  const logsEndRef = useRef(null);
  const previewRef = useRef(null);

  // Auto-scroll logs to bottom as they arrive
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    if (captionPosition === 'custom') {
      return;
    }

    const preset = CAPTION_PRESETS[captionPosition];
    if (preset) {
      setCaptionPosX(preset.x);
      setCaptionPosY(preset.y);
    }
  }, [captionPosition]);

  const updateCaptionFromPointer = (clientX, clientY) => {
    const previewElement = previewRef.current;
    if (!previewElement) {
      return;
    }

    const rect = previewElement.getBoundingClientRect();
    const relativeX = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const relativeY = Math.min(Math.max(clientY - rect.top, 0), rect.height);

    const nextX = Math.round((relativeX / rect.width) * VIDEO_PREVIEW_WIDTH);
    const nextY = Math.round((relativeY / rect.height) * VIDEO_PREVIEW_HEIGHT);

    setCaptionPosition('custom');
    setCaptionPosX(nextX);
    setCaptionPosY(nextY);
  };

  const handlePreviewPointerDown = (event) => {
    if (isLoading) {
      return;
    }

    event.preventDefault();
    updateCaptionFromPointer(event.clientX, event.clientY);
    setIsDraggingCaption(true);
  };

  const handlePreviewPointerMove = (event) => {
    if (!isDraggingCaption || isLoading) {
      return;
    }

    updateCaptionFromPointer(event.clientX, event.clientY);
  };

  const handlePreviewPointerUp = () => {
    if (isDraggingCaption) {
      setIsDraggingCaption(false);
    }
  };

  useEffect(() => {
    if (!isDraggingCaption) {
      return;
    }

    window.addEventListener('pointermove', handlePreviewPointerMove);
    window.addEventListener('pointerup', handlePreviewPointerUp);
    window.addEventListener('pointercancel', handlePreviewPointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePreviewPointerMove);
      window.removeEventListener('pointerup', handlePreviewPointerUp);
      window.removeEventListener('pointercancel', handlePreviewPointerUp);
    };
  }, [isDraggingCaption]);

  const handleGenerate = async (e) => {
    e.preventDefault();

    let url = `${BACKEND_URL}/generate`;
    let body;
    let headers = {};

    if (generationMode === 'youtube') {
      if (!youtubeUrl) {
        setError("Please provide a valid YouTube URL.");
        return;
      }
      body = JSON.stringify({
        youtubeUrl,
        clipLength: Number(clipLength),
        numberOfShorts: Number(numberOfShorts),
        model,
        mode: featureMode,
        stylePreset,
        burnHook,
        highlightColor,
        captionPosition,
        captionPosX: Number(captionPosX),
        captionPosY: Number(captionPosY),
      });
      headers['Content-Type'] = 'application/json';
    } else {
      if (!videoFile) {
        setError("Please select a video file to upload.");
        return;
      }
      const formData = new FormData();
      formData.append('videoFile', videoFile);
      formData.append('clipLength', Number(clipLength));
      formData.append('numberOfShorts', Number(numberOfShorts));
      formData.append('model', model);
      formData.append('mode', featureMode);
      formData.append('stylePreset', stylePreset);
      formData.append('burnHook', burnHook);
      formData.append('highlightColor', highlightColor);
      formData.append('captionPosition', captionPosition);
      formData.append('captionPosX', Number(captionPosX));
      formData.append('captionPosY', Number(captionPosY));
      body = formData;
      url = `${BACKEND_URL}/generate/upload`;
      // Note: Do NOT set Content-Type header when sending FormData; browser sets it automatically
    }

    setIsLoading(true);
    setError(null);
    setLogs([]);
    setClips([]);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP error status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the last incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            
            if (data.status) {
              setLogs((prev) => [...prev, data.status]);
            } else if (data.success === true) {
              setClips(data.clips);
              setLogs((prev) => [...prev, "🎉 Generation pipeline finished successfully!"]);
            } else if (data.success === false) {
              throw new Error(data.error || 'Unknown server error during clip generation.');
            }
          } catch (err) {
            console.warn("Parse line error:", line, err);
          }
        }
      }
    } catch (err) {
      setError(err.message || 'An error occurred during generation.');
      setLogs((prev) => [...prev, `[CRITICAL ERROR] ${err.message}`]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (videoUrl, title) => {
    try {
      const response = await fetch(`${BACKEND_URL}${videoUrl}`);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `${safeTitle}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Failed to download clip locally", err);
      // Fallback: open video file in a new tab
      window.open(`${BACKEND_URL}${videoUrl}`, '_blank');
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">
          AI YouTube & Local Shorts Generator
        </h1>
        <p className="text-gray-500 mt-2 text-sm">
          Local tool to crop and add interactive captions with customized presets to your vertical videos.
        </p>
      </header>

      {/* Main Settings Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm mb-6">
        {/* Mode Switcher Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            type="button"
            onClick={() => setGenerationMode('youtube')}
            disabled={isLoading}
            className={`flex-1 py-3 text-sm font-bold border-b-2 text-center transition duration-150 ${
              generationMode === 'youtube'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            🔗 YouTube Video URL
          </button>
          <button
            type="button"
            onClick={() => setGenerationMode('upload')}
            disabled={isLoading}
            className={`flex-1 py-3 text-sm font-bold border-b-2 text-center transition duration-150 ${
              generationMode === 'upload'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            📁 Local Video Upload
          </button>
        </div>

        {/* Feature Mode Selection Tabs */}
        <div className="mb-6">
          <label className="block text-sm font-bold text-gray-700 mb-2">
            Choose Feature
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setFeatureMode('shorts')}
              disabled={isLoading}
              className={`py-3 px-4 rounded border text-sm font-bold flex flex-col items-center justify-center transition duration-150 ${
                featureMode === 'shorts'
                  ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="text-xl mb-1">✂️</span>
              <span>Auto-Cut into Shorts</span>
              <span className="text-xs font-normal text-gray-400 mt-0.5">Finds highlight clips using LLM</span>
            </button>
            <button
              type="button"
              onClick={() => setFeatureMode('captions_only')}
              disabled={isLoading}
              className={`py-3 px-4 rounded border text-sm font-bold flex flex-col items-center justify-center transition duration-150 ${
                featureMode === 'captions_only'
                  ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="text-xl mb-1">💬</span>
              <span>Caption Only (No Trim)</span>
              <span className="text-xs font-normal text-gray-400 mt-0.5">Captions the entire video length</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          {generationMode === 'youtube' ? (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                YouTube Video URL
              </label>
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                disabled={isLoading}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Select Video File (MP4, MOV)
              </label>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition duration-150 ${
                  videoFile
                    ? 'border-green-500 bg-green-50/50 hover:bg-green-100/50'
                    : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50/30'
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (isLoading) return;
                  const files = e.dataTransfer.files;
                  if (files && files.length > 0) {
                    setVideoFile(files[0]);
                  }
                }}
                onClick={() => {
                  if (!isLoading) {
                    document.getElementById('file-upload-input').click();
                  }
                }}
              >
                <input
                  id="file-upload-input"
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setVideoFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                  disabled={isLoading}
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  {videoFile ? (
                    <>
                      <span className="text-4xl">🎬</span>
                      <span className="text-sm font-semibold text-green-700">{videoFile.name}</span>
                      <span className="text-xs text-gray-500">{(videoFile.size / (1024 * 1024)).toFixed(1)} MB • Click or drag to change</span>
                    </>
                  ) : (
                    <>
                      <span className="text-4xl text-gray-400">📤</span>
                      <span className="text-sm font-medium text-gray-600">Drag & drop your video file here, or <span className="text-blue-600 hover:underline">browse</span></span>
                      <span className="text-xs text-gray-400">Supports MP4, MOV, or other standard video formats</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Caption Style Template Preview Grid */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-gray-700">
              Select Caption Template & Customize Color
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {TEMPLATES.map((template) => {
                const isSelected = stylePreset === template.id;
                return (
                  <div
                    key={template.id}
                    onClick={() => setStylePreset(template.id)}
                    className={`bg-white border rounded-lg overflow-hidden cursor-pointer relative shadow-sm hover:shadow-md transition duration-150 flex flex-col ${
                      isSelected ? 'border-blue-600 ring-2 ring-blue-600/30' : 'border-gray-200'
                    }`}
                  >
                    {/* Selection Checkmark Badge */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold z-10 shadow">
                        ✓
                      </div>
                    )}

                    {/* Visual Caption Box Preview */}
                    <div className="bg-black text-white h-24 flex items-center justify-center relative select-none">
                      <div className="text-center font-extrabold text-xs md:text-sm">
                        {template.id === 'word_pop' && (
                          <p className="uppercase font-sans font-black tracking-wide">
                            {template.previewText1}
                            <span
                              className="px-2 py-0.5 ml-1 rounded text-white"
                              style={{ backgroundColor: highlightColor }}
                            >
                              {template.previewText2}
                            </span>
                          </p>
                        )}
                        {template.id === 'steady_bold' && (
                          <p className="uppercase font-sans font-black tracking-tight">
                            {template.previewText1}
                            <span style={{ color: highlightColor }}>
                              {template.previewText2}
                            </span>
                          </p>
                        )}
                        {template.id === 'cyber_glow' && (
                          <p className="uppercase font-sans font-black tracking-widest text-gray-300">
                            {template.previewText1}
                            <span
                              style={{
                                color: highlightColor,
                                textShadow: `0 0 6px ${highlightColor}`,
                              }}
                            >
                              {template.previewText2}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Card Title Info */}
                    <div className="p-3 border-t border-gray-100 flex-grow flex flex-col justify-between">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-gray-800 text-xs">{template.name}</span>
                        <span className="text-[9px] bg-gray-100 text-gray-500 font-bold px-1.5 py-0.5 rounded tracking-wide uppercase">
                          {template.type}
                        </span>
                      </div>

                      {/* Color Palette Bubbles */}
                      <div className="flex items-center space-x-1.5 mt-2 pt-2 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[9px] font-bold text-gray-400 mr-1 uppercase">Color</span>
                        {PALETTE_COLORS.map((color) => {
                          const isColorActive = highlightColor === color.hex;
                          return (
                            <button
                              key={color.hex}
                              type="button"
                              onClick={() => setHighlightColor(color.hex)}
                              className={`w-5 h-5 rounded-full border transition duration-100 transform hover:scale-110 active:scale-95 ${
                                isColorActive ? 'border-gray-800 ring-2 ring-gray-400/50 ring-offset-1' : 'border-gray-300'
                              }`}
                              style={{ backgroundColor: color.hex }}
                              title={color.name}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-bold text-gray-700">
              Caption Position
            </label>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] gap-4 items-start">
              <div
                ref={previewRef}
                className="relative aspect-[9/16] w-full max-w-[240px] mx-auto lg:max-w-none rounded-2xl overflow-hidden border border-gray-800 shadow-xl bg-gradient-to-b from-gray-950 via-gray-900 to-black select-none touch-none"
                onPointerDown={handlePreviewPointerDown}
                onPointerMove={handlePreviewPointerMove}
                onPointerUp={handlePreviewPointerUp}
                onPointerLeave={handlePreviewPointerUp}
              >
                <div className="absolute inset-0 opacity-60 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_36%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.18),transparent_40%)]" />
                <div className="absolute inset-x-0 top-4 text-center text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
                  Drag the caption inside the short screen
                </div>
                <div className="absolute inset-4 rounded-[1.5rem] border border-white/10" />
                <div
                  className={`absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 px-3 py-2 rounded-xl font-black text-white shadow-2xl border-2 ${isDraggingCaption ? 'scale-105' : 'scale-100'} transition-transform duration-100`}
                  style={{
                    left: `${(Number(captionPosX) / VIDEO_PREVIEW_WIDTH) * 100}%`,
                    top: `${(Number(captionPosY) / VIDEO_PREVIEW_HEIGHT) * 100}%`,
                    backgroundColor: highlightColor,
                    borderColor: 'rgba(255,255,255,0.9)',
                    textShadow: '0 2px 8px rgba(0,0,0,0.45)',
                  }}
                >
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
                    <span>Caption</span>
                    <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[9px]">Move me</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
                    Placement preset
                  </label>
                  <select
                    value={captionPosition}
                    onChange={(e) => setCaptionPosition(e.target.value)}
                    disabled={isLoading}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    {CAPTION_POSITIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
                      X
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1080"
                      value={captionPosX}
                      onChange={(e) => {
                        setCaptionPosition('custom');
                        setCaptionPosX(e.target.value);
                      }}
                      disabled={isLoading}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
                      Y
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1920"
                      value={captionPosY}
                      onChange={(e) => {
                        setCaptionPosition('custom');
                        setCaptionPosY(e.target.value);
                      }}
                      disabled={isLoading}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Tap or drag the caption on the mock short screen to place it anywhere. The X/Y fields update automatically.
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Custom position uses the rendered 1080x1920 canvas. Pick a preset or enter exact coordinates to place captions anywhere on screen.
            </p>
          </div>

          {featureMode === 'shorts' && (
            <>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  Groq LLM Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={isLoading}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Fast / High Limits)</option>
                  <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Smart / High Quality)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    Number of Shorts
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={numberOfShorts}
                    onChange={(e) => setNumberOfShorts(e.target.value)}
                    disabled={isLoading}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    Max Clip Length (seconds)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="90"
                    value={clipLength}
                    onChange={(e) => setClipLength(e.target.value)}
                    disabled={isLoading}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="flex items-start bg-gray-50 border border-gray-100 rounded-md p-3">
                <div className="flex items-center h-5">
                  <input
                    id="burnHook"
                    type="checkbox"
                    checked={burnHook}
                    onChange={(e) => setBurnHook(e.target.checked)}
                    disabled={isLoading}
                    className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded cursor-pointer"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="burnHook" className="font-bold text-gray-700 cursor-pointer">Burn Hook Banner</label>
                  <p className="text-gray-500 text-xs mt-0.5">If enabled, a colorful top banner with the clip title will be burned into the first 4 seconds of each short.</p>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-2.5 rounded font-bold text-sm text-white transition duration-150 ${
              isLoading
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
            }`}
          >
            {isLoading 
              ? (featureMode === 'captions_only' ? 'Adding Interactive Captions...' : 'Processing Pipeline...') 
              : (featureMode === 'captions_only' ? 'Add Interactive Captions' : 'Generate Shorts')}
          </button>
        </form>
      </div>

      {/* Progress & Log Output */}
      {(isLoading || logs.length > 0 || error) && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 shadow-inner mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400 text-xs font-mono uppercase tracking-wider">
              System Logs & Status
            </span>
            {isLoading && (
              <span className="flex items-center text-blue-400 text-xs font-mono">
                <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-blue-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            )}
          </div>

          {/* Terminal Box */}
          <div className="terminal-logs max-h-60 overflow-y-auto font-mono text-xs text-green-400 space-y-1 p-2 bg-black rounded border border-gray-800">
            {logs.map((log, idx) => (
              <div key={idx} className="whitespace-pre-wrap">
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 bg-red-950 border border-red-800 rounded p-3 text-red-300 text-sm font-semibold">
              ⚠️ {error}
            </div>
          )}
        </div>
      )}

      {/* Generated Shorts List */}
      {clips.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Generated Shorts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {clips.map((clip, idx) => (
              <div key={idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
                <div className="bg-gray-100 flex items-center justify-center p-4">
                  <div className="aspect-[9/16] w-56 max-w-full bg-black rounded shadow-md overflow-hidden relative">
                    <video
                      src={`${BACKEND_URL}${clip.video}`}
                      controls
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="p-4 flex-grow flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-gray-800 text-base line-clamp-1">
                      {clip.title}
                    </h3>
                    {clip.hook && (
                      <div className="mt-1 text-xs bg-yellow-100 text-yellow-800 font-semibold px-2 py-1 rounded inline-block">
                        🎯 Hook: "{clip.hook}"
                      </div>
                    )}
                    <p className="text-gray-500 text-xs mt-1.5">
                      Timestamps: {parseFloat(clip.start).toFixed(1)}s - {parseFloat(clip.end).toFixed(1)}s
                    </p>
                    <p className="text-gray-600 text-sm mt-2 font-mono whitespace-pre-wrap border border-gray-100 p-2 bg-gray-50 rounded select-all">
                      {clip.caption}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownload(clip.video, clip.title)}
                    className="mt-4 w-full bg-gray-800 hover:bg-gray-900 active:bg-black text-white font-bold py-2 rounded text-xs transition duration-100"
                  >
                    Download Short
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
