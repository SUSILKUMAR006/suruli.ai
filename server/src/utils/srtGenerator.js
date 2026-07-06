const fs = require('fs');

/**
 * Format seconds to SRT timestamp format (HH:MM:SS,mmm)
 */
function formatSrtTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds - hrs * 3600) / 60);
  const secs = Math.floor(seconds - hrs * 3600 - mins * 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);

  return [
    String(hrs).padStart(2, '0'),
    ':',
    String(mins).padStart(2, '0'),
    ':',
    String(secs).padStart(2, '0'),
    ',',
    String(ms).padStart(3, '0')
  ].join('');
}

/**
 * Generates SRT file content for a specific clip range from Whisper transcription JSON.
 * Falls back to segment level if word level is missing.
 */
function generateSrtForClip(whisperData, clipStart, clipEnd) {
  const srtBlocks = [];
  let index = 1;

  // Try to use word-level timestamps first
  let words = [];
  if (whisperData.segments) {
    for (const seg of whisperData.segments) {
      if (seg.words && seg.words.length > 0) {
        words.push(...seg.words);
      }
    }
  }

  // Filter words that fit within the clip range
  const clipWords = words.filter(w => w.start >= clipStart && w.end <= clipEnd);

  if (clipWords.length > 0) {
    // Group words into punchy short phrases
    let currentGroup = [];
    let currentTextLength = 0;
    const MAX_WORDS = 3; // 3 words max per line for punchy Short subtitles
    const MAX_CHARS = 20; // 20 chars max
    const MAX_GAP = 0.5;  // 0.5s max gap before splitting

    for (let i = 0; i < clipWords.length; i++) {
      const word = clipWords[i];
      const wordText = word.word.trim();
      
      const prevWord = currentGroup[currentGroup.length - 1];
      const timeGap = prevWord ? (word.start - prevWord.end) : 0;

      // Check if we need to split and output the current group
      const shouldSplit = currentGroup.length > 0 && (
        currentGroup.length >= MAX_WORDS ||
        currentTextLength + wordText.length + 1 > MAX_CHARS ||
        timeGap > MAX_GAP
      );

      if (shouldSplit) {
        // Output current group as SRT block
        const startSec = currentGroup[0].start - clipStart;
        const endSec = currentGroup[currentGroup.length - 1].end - clipStart;
        const text = currentGroup.map(w => w.word.trim()).join(' ');

        srtBlocks.push(`${index++}\n${formatSrtTime(Math.max(0, startSec))} --> ${formatSrtTime(endSec)}\n${text}\n`);
        
        // Reset group
        currentGroup = [];
        currentTextLength = 0;
      }

      currentGroup.push(word);
      currentTextLength += wordText.length + 1;
    }

    // Add final group if any
    if (currentGroup.length > 0) {
      const startSec = currentGroup[0].start - clipStart;
      const endSec = currentGroup[currentGroup.length - 1].end - clipStart;
      const text = currentGroup.map(w => w.word.trim()).join(' ');
      srtBlocks.push(`${index++}\n${formatSrtTime(Math.max(0, startSec))} --> ${formatSrtTime(endSec)}\n${text}\n`);
    }

  } else {
    // Fall back to segments if word-level timestamps aren't available or empty
    const segments = whisperData.segments || [];
    const clipSegments = segments.filter(seg => {
      // Overlaps with the range
      return seg.start < clipEnd && seg.end > clipStart;
    });

    for (const seg of clipSegments) {
      // Adjust boundaries to clip range
      const startSec = Math.max(seg.start, clipStart) - clipStart;
      const endSec = Math.min(seg.end, clipEnd) - clipStart;
      const text = seg.text.trim();

      if (startSec < endSec && text) {
        srtBlocks.push(`${index++}\n${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\n${text}\n`);
      }
    }
  }

  return srtBlocks.join('\n');
}

module.exports = {
  formatSrtTime,
  generateSrtForClip
};
