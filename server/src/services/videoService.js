const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Utility to extract YouTube Video ID from URL
 */
function getYoutubeId(url) {
  const regExp = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regExp);
  return (match && match[1]) ? match[1] : null;
}

/**
 * Helper to run a command with spawned stream and logging
 */
function spawnPromise(command, args, options = {}, onLog) {
  return new Promise((resolve, reject) => {
    onLog(`[EXEC] Running: ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, options);
    let stdoutData = '';
    let stderrData = '';

    proc.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        stdoutData += line + '\n';
        onLog(line);
      }
    });

    proc.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        stderrData += line + '\n';
        // ffmpeg writes progress to stderr, so we log it but don't reject
        onLog(line);
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdoutData);
      } else {
        reject(new Error(`Command ${command} failed with exit code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Downloads a video using yt-dlp
 */
async function downloadVideo(url, videoId, onLog) {
  const videoPath = path.join(__dirname, '../../../videos', `${videoId}.mp4`);
  
  if (fs.existsSync(videoPath)) {
    onLog(`[INFO] Video already exists locally: ${videoPath}. Skipping download.`);
    return videoPath;
  }

  onLog(`[PROCESS] Downloading video from URL: ${url}`);
  
  // Choose best mp4 compatible quality and merge
  const args = [
    '-m', 'yt_dlp',
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '-o', videoPath,
    url
  ];

  await spawnPromise('python', args, {}, onLog);
  onLog(`[SUCCESS] Download completed. Saved to ${videoPath}`);
  return videoPath;
}

/**
 * Extracts audio in 16kHz mono WAV format for Whisper
 */
async function extractAudio(videoId, onLog) {
  const videoPath = path.join(__dirname, '../../../videos', `${videoId}.mp4`);
  const audioPath = path.join(__dirname, '../../../temp', `${videoId}.wav`);

  if (fs.existsSync(audioPath)) {
    onLog(`[INFO] Audio already extracted: ${audioPath}. Skipping extraction.`);
    return audioPath;
  }

  onLog(`[PROCESS] Extracting audio for Whisper transcription...`);
  
  // Format: WAV, PCM 16-bit, 16kHz, mono
  const args = [
    '-y',
    '-i', videoPath,
    '-vn',
    '-acodec', 'pcm_s16le',
    '-ar', '16000',
    '-ac', '1',
    audioPath
  ];

  await spawnPromise('ffmpeg', args, {}, onLog);
  onLog(`[SUCCESS] Audio extraction completed. Saved to ${audioPath}`);
  return audioPath;
}

/**
 * Queries video width and height using ffprobe
 */
function getVideoDimensions(videoId) {
  const videoPath = path.join(__dirname, '../../../videos', `${videoId}.mp4`);
  return new Promise((resolve, reject) => {
    const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${videoPath}"`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`Failed to query dimensions: ${stderr || err.message}`));
      }
      try {
        const data = JSON.parse(stdout);
        if (data.streams && data.streams.length > 0) {
          resolve({
            width: data.streams[0].width,
            height: data.streams[0].height
          });
        } else {
          reject(new Error('No video streams found in ffprobe output'));
        }
      } catch (e) {
        reject(new Error(`Error parsing ffprobe output: ${e.message}`));
      }
    });
  });
}

/**
 * Cuts a video clip, center-crops to 9:16, scales to 1080x1920, and burns subtitles
 */
async function processClip(videoId, clipId, start, end, onLog) {
  const subtitlesDir = path.join(__dirname, '../../../subtitles');
  const outputDir = path.join(__dirname, '../../../output');

  // Query dimensions
  const dims = await getVideoDimensions(videoId);
  onLog(`[INFO] Video dimensions: ${dims.width}x${dims.height}`);

  // Calculate crop parameters for 9:16 vertical video
  let cropW, cropH, cropX, cropY;
  const targetAspect = 9 / 16;
  const currentAspect = dims.width / dims.height;

  if (currentAspect > targetAspect) {
    // Landscape video - crop the width
    cropH = dims.height;
    cropW = Math.floor(dims.height * targetAspect);
    cropW = cropW - (cropW % 2); // Make even
    cropX = Math.floor((dims.width - cropW) / 2);
    cropY = 0;
  } else {
    // Already portrait or narrower - crop the height
    cropW = dims.width;
    cropH = Math.floor(dims.width / targetAspect);
    cropH = cropH - (cropH % 2); // Make even
    cropX = 0;
    cropY = Math.floor((dims.height - cropH) / 2);
  }

  const duration = (parseFloat(end) - parseFloat(start)).toFixed(2);
  onLog(`[PROCESS] Cutting and rendering clip ${clipId} (${duration}s, start: ${start}s, end: ${end}s)...`);

  // To prevent backslash/colon escaping issues in Windows for the subtitles filter,
  // we run FFmpeg with the working directory set to subtitlesDir.
  // The subtitles filter argument is then simply the local filename.
  const relativeInput = path.relative(subtitlesDir, path.join(__dirname, '../../../videos', `${videoId}.mp4`));
  const relativeOutput = path.relative(subtitlesDir, path.join(outputDir, `${clipId}.mp4`));
  const localAssName = `${clipId}.ass`;

  // FFmpeg command parts:
  // -ss start
  // -t duration
  // -i input
  // -vf (crop, scale, burn subtitles from ASS file config)
  const filterString = `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=1080:1920,subtitles=${localAssName}`;

  const args = [
    '-y',
    '-ss', String(start),
    '-t', String(duration),
    '-i', relativeInput,
    '-vf', filterString,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '22',
    '-c:a', 'aac',
    '-b:a', '192k',
    relativeOutput
  ];

  await spawnPromise('ffmpeg', args, { cwd: subtitlesDir }, onLog);
  onLog(`[SUCCESS] Generated short: ${clipId}.mp4`);
  return `${clipId}.mp4`;
}

module.exports = {
  getYoutubeId,
  downloadVideo,
  extractAudio,
  getVideoDimensions,
  processClip
};
