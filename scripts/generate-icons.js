/**
 * Script to generate PNG icons from SVG
 * Run: node scripts/generate-icons.js
 *
 * For now, we provide base64-encoded PNG icons directly.
 * In production, use a proper image conversion tool.
 */

const fs = require('fs');
const path = require('path');

// Base64-encoded PNG icons (simple blue rounded square with retweet icon)
// These are placeholder icons - replace with your designed icons

const icons = {
  16: `iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADCSURBVDiNpdMxDoJAEAXQNxZWJpRewMRb2HgBW69gYWPtHbiBNVfw/pbsGkFnd/8kU8zMn8kOzCzJnKRJkiTlkDZJO0mjKIr6JJckQ5ImSZIhyR1AKqBNcktyT7Lvuu4A0AJoAWwBNACuST5d1x0A2rIsnwC2AK4AzkU7oOs6AB2APskcQFu2B4AWwAqgA3Af2ALYA7gk+QLYAFgNbJskTwAbAOuyHEi+AaxHNgN49H1/ArAGsBn4guQEYD2wjwB+AH2CR4s0mDaAAAAAAElFTkSuQmCC`,

  32: `iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAE5SURBVFiF7ZYxDoJAEEXfWlhZUHoBE29h4wVsvYKFjbV38AbWXMH7W7IugoisO/snmWImO/MnO8tuZhYkNZIaSRJJ2iQdJI2iKOqT3JIMSRJJ6iQPACmBNsmtyD3JvgzZA7QAWgBbAA2Aa5JPGbIHaMs0egLYArhKsuna7gDQlmn0BLAFcC3a8QDQAOgBzAG0RTsCaAGsADoA9z4tgD2AS5IvgA2A1UC3SfIEsAGwLsMbyRfAemAzgEf57AnAGsBmYF8kOQFYD+wjgB8A+Ds8Bg`,

  48: `iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAB2AAAAdgB+lymcgAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAGYSURBVGiB7ZmxbsIwEIb/a7p0oFKXPkGlvEWXPkDpK3To0LVv0DeoshTxfg4dMpQpD4AlqyDR2L7/JJR8sa/65eSLY9sADcAMwESSCknHJFeSGknzJHuSIUmTpCHJA0BKQJvkXuSepCFC9gBaAC2ALYAGwDXJpwjZA7Rlmj0BbAFcS3Z8AGgA9ADmANqyOwK0AFYAOgD3Pi2APYBL0V8ANgBWA90myRPABsC6LG8kXwDrgc0AHuW9JwBrAJuBfUlyArAe2EcAfwDEH/EZ`,

  128: `iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAEhAAABIQBPaTrBgAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANlSURBVHic7d1BbhoxFAbg/7VZdIGqS5+gUt6iS5+g9AoddujaN+gbVNmK6PssnSxQpcvkAaiyCkJ2bP+GKPNJswGP5/czJuMZYwBqAGYAJpKUSDomuZLUSJonOZAMSZokDUkeAFIC2iT3IvckDxGyB2gBtAC2ABoA1ySfImQP0JZp9gSwBXAt2fEBoAHQA5gDaMv+CKAFsALQAbj3aQHsAVyK+gKwAbAa6DZJngA2ANZleSP5AlgPbAbwKO89AVgD2AzsS5ITgPXAPgL4AyD+iM8A`
};

// Write icons
const iconsDir = path.join(__dirname, '..', 'extension', 'icons');

Object.entries(icons).forEach(([size, base64]) => {
  const filename = path.join(iconsDir, `icon${size}.png`);
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync(filename, buffer);
  console.log(`Created ${filename}`);
});

console.log('\nDone! Icons created in extension/icons/');
console.log('\nNote: These are placeholder icons. For production:');
console.log('1. Design proper icons in your favorite image editor');
console.log('2. Export as PNG at 16x16, 32x32, 48x48, and 128x128');
console.log('3. Replace the files in extension/icons/');
