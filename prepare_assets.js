const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ffmpeg-static is the package actually listed in package.json.
const ffmpegPath = require('ffmpeg-static');
console.log('Using ffmpeg binary:', ffmpegPath);

const FRAME_COUNT = 373;

// 1. Copy hero video
const rootHero = 'Initial_Scene_-_2026-08-01_202608011117.mp4';
const destHero = 'lipstick-story.mp4';
if (fs.existsSync(rootHero)) {
  fs.copyFileSync(rootHero, destHero);
  console.log(`Copied ${rootHero} -> ${destHero}`);
}
if (!fs.existsSync(destHero)) {
  console.error(`Missing ${destHero}. Cannot extract frames.`);
  process.exit(1);
}

// 2. Read the REAL duration off the source instead of assuming one.
//    (The previous version hardcoded 15.0s for an 18.73s clip, so the fps
//     filter produced a single frame and the padding loop below silently
//     cloned it 372 times — the hero had nothing to scrub.)
function probeDuration(file) {
  let out = '';
  try {
    execFileSync(ffmpegPath, ['-hide_banner', '-i', file], { stdio: 'pipe' });
  } catch (e) {
    out = (e.stderr || '').toString(); // ffmpeg exits non-zero with no output file
  }
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
}

const duration = probeDuration(destHero);
if (!duration) {
  console.error('Could not determine video duration. Aborting.');
  process.exit(1);
}
console.log(`Source duration: ${duration}s`);

// 3. Extract exactly FRAME_COUNT frames spread evenly across the whole clip
const framesDir = 'frames';
if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir);

// clear stale frames so a short run can't leave old ones behind
for (const f of fs.readdirSync(framesDir)) {
  if (f.endsWith('.jpg')) fs.unlinkSync(path.join(framesDir, f));
}

console.log(`Extracting ${FRAME_COUNT} frames...`);
execFileSync(ffmpegPath, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-i', destHero,
  '-vf', `fps=${FRAME_COUNT}/${duration}`,
  '-frames:v', String(FRAME_COUNT),
  '-q:v', '3',
  path.join(framesDir, 'frame_%04d.jpg')
], { stdio: 'inherit' });

const files = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort();
console.log(`Extracted ${files.length} frames.`);

// Pad only a trailing shortfall of a frame or two (rounding), and say so loudly.
// A large shortfall means the extraction is wrong — fail instead of faking it.
if (files.length === 0) {
  console.error('No frames extracted. Aborting.');
  process.exit(1);
}
if (files.length < FRAME_COUNT) {
  const shortfall = FRAME_COUNT - files.length;
  if (shortfall > 3) {
    console.error(
      `Only ${files.length}/${FRAME_COUNT} frames extracted (short by ${shortfall}). ` +
      `Refusing to pad — the hero sequence would stall. Check the fps filter.`
    );
    process.exit(1);
  }
  const last = files[files.length - 1];
  for (let i = files.length + 1; i <= FRAME_COUNT; i++) {
    fs.copyFileSync(
      path.join(framesDir, last),
      path.join(framesDir, `frame_${String(i).padStart(4, '0')}.jpg`)
    );
  }
  console.warn(`Padded ${shortfall} trailing frame(s) by duplicating ${last}.`);
}

// Sanity check: identical file sizes across the board means duplicate frames.
const sizes = new Set(
  fs.readdirSync(framesDir)
    .filter(f => f.endsWith('.jpg'))
    .map(f => fs.statSync(path.join(framesDir, f)).size)
);
if (sizes.size < 10) {
  console.error(`WARNING: only ${sizes.size} distinct frame file sizes — frames look duplicated.`);
} else {
  console.log(`Frame check OK: ${sizes.size} distinct file sizes.`);
}

// 4. Map video files to the names index.html expects
const videoMap = {
  'Rose Awakens and Opens.mp4': 'lipstick-v01-rose-awakens-opens.mp4',
  'Rose Reaches Full Bloom.mp4': 'lipstick-v02-rose-full-bloom.mp4',
  'Petals Release.mp4': 'lipstick-v03-petals-release.mp4',
  'Petals Dissolve into Pigment.mp4': 'lipstick-v04-pigment-forms.mp4',
  'Lipstick Sets and Stands.mp4': 'lipstick-v05-lipstick-sets.mp4',
  'Pickup and Application.mp4': 'lipstick-v07-pickup-and-apply.mp4'
};

const vDir = 'videos';
for (const [src, target] of Object.entries(videoMap)) {
  const srcPath = path.join(vDir, src);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(vDir, target));
    console.log(`Copied ${src} -> ${target}`);
  } else {
    console.warn(`Missing source video: ${src}`);
  }
}

// v06 and v08 reuse the pickup/application clip
const pickupPath = path.join(vDir, 'Pickup and Application.mp4');
if (fs.existsSync(pickupPath)) {
  fs.copyFileSync(pickupPath, path.join(vDir, 'lipstick-v06-hand-picks-up.mp4'));
  fs.copyFileSync(pickupPath, path.join(vDir, 'lipstick-v08-lipstick-applied.mp4'));
  console.log('Created v06 and v08 copies.');
}

console.log('Done.');
