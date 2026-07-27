const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * Groups raw Whisper segments into 30-second blocks and writes them to a simplified text file
 */
function generateSimpleTxt(jsonPath, txtPath, onLog) {
  try {
    onLog(`[INFO] Formulating transcript JSON into compressed 30-second integer blocks...`);
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const segments = data.segments || [];
    let txtContent = '';
    
    let currentBlockStart = null;
    let currentBlockEnd = null;
    let currentBlockText = [];
    
    for (const seg of segments) {
      const start = seg.start || 0;
      const end = seg.end || 0;
      const text = (seg.text || '').trim();
      if (!text) continue;
      
      if (currentBlockStart === null) {
        currentBlockStart = start;
        currentBlockEnd = end;
        currentBlockText.push(text);
      } else if (start - currentBlockStart < 30.0) {
        currentBlockEnd = end;
        currentBlockText.push(text);
      } else {
        txtContent += `[${Math.round(currentBlockStart)}-${Math.round(currentBlockEnd)}] ${currentBlockText.join(' ')}\n`;
        currentBlockStart = start;
        currentBlockEnd = end;
        currentBlockText = [text];
      }
    }
    
    if (currentBlockStart !== null) {
      txtContent += `[${Math.round(currentBlockStart)}-${Math.round(currentBlockEnd)}] ${currentBlockText.join(' ')}\n`;
    }
    
    fs.writeFileSync(txtPath, txtContent, 'utf8');
    onLog(`[SUCCESS] Compressed transcript written to ${txtPath}`);
  } catch (err) {
    onLog(`[ERROR] Failed to generate simplified transcript text: ${err.message}`);
    throw err;
  }
}

/**
 * Runs Whisper via the local transcribe.py python script
 */
async function runWhisper(audioPath, videoId, onLog) {
  const jsonPath = path.join(__dirname, '../../../transcripts', `${videoId}.json`);
  const txtPath = path.join(__dirname, '../../../transcripts', `${videoId}_simple.txt`);

  // Check cache: If JSON already exists, we skip python Whisper and regenerate simple text directly
  if (fs.existsSync(jsonPath)) {
    const jsonStats = fs.statSync(jsonPath);
    if (jsonStats.size > 0) {
      onLog(`[INFO] Transcript JSON already exists: ${jsonPath}. Re-generating compressed simple text.`);
      generateSimpleTxt(jsonPath, txtPath, onLog);
      return { jsonPath, txtPath };
    }
  }

  onLog(`[PROCESS] Starting local Whisper transcription (generating word-level timestamps)...`);
  const scriptPath = path.join(__dirname, '../../scripts/transcribe.py');
  const modelName = process.env.WHISPER_MODEL || 'base';

  return new Promise((resolve, reject) => {
    const args = [
      scriptPath,
      '--audio', audioPath,
      '--output', jsonPath,
      '--text-output', txtPath,
      '--model', modelName
    ];

    onLog(`[EXEC] Running: python ${args.join(' ')}`);
    const proc = spawn('python', args);

    proc.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        text.split('\n').forEach(line => {
          if (line.trim()) onLog(`[Whisper] ${line.trim()}`);
        });
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        text.split('\n').forEach(line => {
          if (line.trim()) onLog(`[Whisper-Error/Status] ${line.trim()}`);
        });
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        onLog(`[SUCCESS] Whisper transcription completed.`);
        try {
          generateSimpleTxt(jsonPath, txtPath, onLog);
          resolve({ jsonPath, txtPath });
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error(`Whisper transcription process exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = {
  runWhisper
};
