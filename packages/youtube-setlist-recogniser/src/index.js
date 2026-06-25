const YouTubeSetlistRecogniser = require('./YouTubeSetlistRecogniser');

async function recognizeSetlist(url, options = {}) {
  const recogniser = new YouTubeSetlistRecogniser(options);
  return await recogniser.recognize(url, options);
}

async function analyzeSetlist(url, options = {}) {
  const recogniser = new YouTubeSetlistRecogniser(options);
  return await recogniser.analyze(url, options);
}

module.exports = {
  YouTubeSetlistRecogniser,
  recognizeSetlist,
  analyzeSetlist
};