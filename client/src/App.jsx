import React, { useState, useEffect, useRef } from 'react';

const BACKEND_URL = 'http://localhost:5000';

function App() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [clipLength, setClipLength] = useState(45);
  const [numberOfShorts, setNumberOfShorts] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [clips, setClips] = useState([]);

  const logsEndRef = useRef(null);

  // Auto-scroll logs to bottom as they arrive
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!youtubeUrl) {
      setError("Please provide a valid YouTube URL.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setLogs([]);
    setClips([]);

    try {
      const response = await fetch(`${BACKEND_URL}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          youtubeUrl,
          clipLength: Number(clipLength),
          numberOfShorts: Number(numberOfShorts),
        }),
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
          AI YouTube Shorts Generator
        </h1>
        <p className="text-gray-500 mt-2 text-sm">
          Local tool to cut standard videos into engaging 9:16 vertical shorts with captions.
        </p>
      </header>

      {/* Main Settings Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm mb-6">
        <form onSubmit={handleGenerate} className="space-y-4">
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

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-2.5 rounded font-bold text-sm text-white ${
              isLoading
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
            }`}
          >
            {isLoading ? 'Processing Pipeline...' : 'Generate Shorts'}
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
                    <p className="text-gray-500 text-xs mt-1">
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
