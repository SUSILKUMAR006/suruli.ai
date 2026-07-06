/**
 * Format seconds to ASS timestamp format (H:MM:SS.cs)
 */
function formatAssTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds - hrs * 3600) / 60);
  const secs = Math.floor(seconds - hrs * 3600 - mins * 60);
  const cs = Math.floor(Math.round((seconds - Math.floor(seconds)) * 100));
  
  // Guard against centisecond overflow
  const cleanCs = cs >= 100 ? 99 : cs;

  return [
    String(hrs),
    ':',
    String(mins).padStart(2, '0'),
    ':',
    String(secs).padStart(2, '0'),
    '.',
    String(cleanCs).padStart(2, '0')
  ].join('');
}

/**
 * Generates ASS file content for a specific clip range from Whisper transcription JSON.
 * Groups words into blocks of 4-5 words and highlights the active word in Yellow.
 */
function generateAssForClip(whisperData, clipStart, clipEnd) {
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Style settings: Arial Black, Size 88 (increased font size), Outline 5.5px Black, Alignment 2 (Centered Bottom), MarginV 800 (slightly below center)
    'Style: Default,Arial Black,88,&H0000FFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,5.5,0,2,10,10,800,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ].join('\n');

  const assLines = [];

  // Extract all words from transcription
  let words = [];
  if (whisperData.segments) {
    for (const seg of whisperData.segments) {
      if (seg.words && seg.words.length > 0) {
        words.push(...seg.words);
      }
    }
  }

  // Filter words that fit within the clip range
  let clipWords = words.filter(w => w.start >= clipStart && w.end <= clipEnd);

  // Fallback: if no word timestamps, estimate word timings from segment durations
  if (clipWords.length === 0) {
    const segments = whisperData.segments || [];
    const clipSegments = segments.filter(seg => seg.start < clipEnd && seg.end > clipStart);

    for (const seg of clipSegments) {
      const segStart = Math.max(seg.start, clipStart);
      const segEnd = Math.min(seg.end, clipEnd);
      const segDuration = segEnd - segStart;
      const cleanText = seg.text.trim();
      if (!cleanText) continue;

      const segWords = cleanText.split(/\s+/);
      if (segWords.length === 0) continue;

      const wordDuration = segDuration / segWords.length;
      for (let i = 0; i < segWords.length; i++) {
        clipWords.push({
          word: segWords[i],
          start: segStart + (i * wordDuration),
          end: segStart + ((i + 1) * wordDuration)
        });
      }
    }
  }

  if (clipWords.length > 0) {
    // Group words into blocks of at most 4 words for a clean, stable horizontal layout
    const groups = [];
    let currentGroup = [];
    const MAX_GROUP_WORDS = 4; // 4 words per group
    const MAX_SILENCE = 1.0;   // 1s silence gap

    for (let i = 0; i < clipWords.length; i++) {
      const word = clipWords[i];
      const prevWord = currentGroup[currentGroup.length - 1];
      const timeGap = prevWord ? (word.start - prevWord.end) : 0;

      if (currentGroup.length > 0 && (currentGroup.length >= MAX_GROUP_WORDS || timeGap > MAX_SILENCE)) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(word);
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    // Build dialogue lines for each word in each group
    for (const group of groups) {
      for (let i = 0; i < group.length; i++) {
        const activeWord = group[i];
        
        // Start time of the highlight frame
        const startSec = Math.max(0, activeWord.start - clipStart);
        
        // End time of the highlight frame: next word's start, or this word's end if last
        let endSec;
        if (i < group.length - 1) {
          endSec = Math.max(startSec + 0.05, group[i + 1].start - clipStart);
        } else {
          endSec = Math.max(startSec + 0.1, activeWord.end - clipStart);
        }

        const startTimeStr = formatAssTime(startSec);
        const endTimeStr = formatAssTime(endSec);

        // Build the text showing all words in the group, with only the active word in Yellow
        const lineParts = [];
        for (let j = 0; j < group.length; j++) {
          const w = group[j];
          const wordText = w.word.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "").toUpperCase();
          if (!wordText) continue;

          if (j === i) {
            // Active word: Yellow (\c&H0000FFFF)
            lineParts.push(`{\\c&H0000FFFF}${wordText}`);
          } else {
            // Inactive words: White (\c&H00FFFFFF)
            lineParts.push(`{\\c&H00FFFFFF}${wordText}`);
          }
        }

        const lineText = lineParts.join(' ');
        if (lineText.trim()) {
          assLines.push(`Dialogue: 0,${startTimeStr},${endTimeStr},Default,,0,0,0,,${lineText}`);
        }
      }
    }
  }

  return header + '\n' + assLines.join('\n');
}

module.exports = {
  formatAssTime,
  generateAssForClip
};
