const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend local development (typically on port 5173)
app.use(cors());
app.use(express.json());

// Serve generated clips from the output folder statically
const outputDir = path.join(__dirname, '../../output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
app.use('/output', express.static(outputDir));

// Routes
const generateRouter = require('./routes/generate');
app.use('/generate', generateRouter);

// Pre-flight validation checks to confirm critical dependencies exist
function runPreflightChecks() {
  console.log('--- RUNNING PREFLIGHT CHECKS ---');
  let allPassed = true;

  // 1. Check ffmpeg
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    console.log('[SUCCESS] FFmpeg detected successfully.');
  } catch (e) {
    console.warn('[WARNING] FFmpeg was not detected in PATH. Video rendering will fail unless ffmpeg is installed.');
    allPassed = false;
  }

  // 2. Check yt-dlp
  try {
    execSync('yt-dlp --version', { stdio: 'ignore' });
    console.log('[SUCCESS] yt-dlp detected successfully.');
  } catch (e) {
    console.warn('[WARNING] yt-dlp was not detected. Video downloads will fail.');
    allPassed = false;
  }

  // 3. Check python
  try {
    execSync('python --version', { stdio: 'ignore' });
    console.log('[SUCCESS] Python detected successfully.');
  } catch (e) {
    console.warn('[WARNING] Python was not detected. Whisper transcription will fail.');
    allPassed = false;
  }

  // 4. Check Whisper dependencies
  try {
    execSync('python -c "import whisper"', { stdio: 'ignore' });
    console.log('[SUCCESS] Python whisper library detected successfully.');
  } catch (e) {
    console.warn('[WARNING] Whisper module is not installed in Python. Transcription will fail. Run: pip install openai-whisper torch');
    allPassed = false;
  }

  // 5. Check Groq Key
  if (process.env.GROQ_API_KEY) {
    console.log('[SUCCESS] GROQ_API_KEY environment variable is configured.');
  } else {
    console.warn('[WARNING] GROQ_API_KEY environment variable is missing.');
    allPassed = false;
  }

  console.log('--------------------------------');
  return allPassed;
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running locally on http://localhost:${PORT}`);
  runPreflightChecks();
});
