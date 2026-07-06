const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * Runs Whisper via the local transcribe.py python script
 */
async function runWhisper(audioPath, videoId, onLog) {
  const jsonPath = path.join(__dirname, '../../../transcripts', `${videoId}.json`);
  const txtPath = path.join(__dirname, '../../../transcripts', `${videoId}_simple.txt`);

  if (fs.existsSync(jsonPath) && fs.existsSync(txtPath)) {
    onLog(`[INFO] Transcript already exists: ${jsonPath}. Skipping transcription.`);
    return { jsonPath, txtPath };
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
        resolve({ jsonPath, txtPath });
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
