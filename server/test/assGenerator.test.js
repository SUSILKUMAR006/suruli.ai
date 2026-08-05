const test = require('node:test');
const assert = require('node:assert/strict');
const { generateAssForClip } = require('../src/utils/assGenerator');

test('generates word-highlight events with animation tags', () => {
  const whisperData = {
    segments: [
      {
        start: 0.0,
        end: 1.2,
        text: 'hello world',
        words: [
          { word: 'hello', start: 0.0, end: 0.5 },
          { word: 'world', start: 0.5, end: 1.1 }
        ]
      }
    ]
  };

  const ass = generateAssForClip(whisperData, 0.2, 0.9, '', { preset: 'word_pop' });

  assert.match(ass, /HELLO/);
  assert.match(ass, /WORLD/);
  assert.match(ass, /\\rActive/);
  assert.doesNotMatch(ass, /\\\{\\\\rActive/);
});
