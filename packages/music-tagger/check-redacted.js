// Quick script to check Redacted torrent group data
const fs = require('fs');
const path = require('path');

// Read .env file manually
const envPath = path.join(__dirname, 'backend', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const REDACTED_API_KEY = envVars.REDACTED_API_KEY;
const REDACTED_DOMAIN = envVars.REDACTED_DOMAIN;

if (!REDACTED_API_KEY || !REDACTED_DOMAIN) {
  console.error('❌ Missing REDACTED_API_KEY or REDACTED_DOMAIN in backend/.env');
  process.exit(1);
}

const torrentGroupId = 1964213;
const url = `https://${REDACTED_DOMAIN}/ajax.php?action=torrentgroup&id=${torrentGroupId}`;

console.log(`🔍 Fetching Redacted data for torrent group ${torrentGroupId}...`);
console.log(`   URL: ${url}`);
console.log();

fetch(url, {
  headers: {
    'Authorization': REDACTED_API_KEY,
    'User-Agent': 'music-tagger/1.0.0'
  }
})
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  })
  .then(data => {
    if (data.status !== 'success') {
      throw new Error(`API returned status: ${data.status}`);
    }

    const group = data.response.group;
    console.log('✅ Successfully fetched data from Redacted\n');
    console.log('📀 Album Information:');
    console.log(`   Artist: ${group.musicInfo?.artists?.[0]?.name || 'Unknown'}`);
    console.log(`   Name: ${group.name}`);
    console.log(`   Year: ${group.year}`);
    console.log();
    console.log('🏷️  Tags (Genres):');
    if (group.tags && group.tags.length > 0) {
      group.tags.forEach(tag => console.log(`   - ${tag}`));
    } else {
      console.log('   (no tags)');
    }
    console.log();
    console.log('📊 Raw Tags Array:');
    console.log(`   ${JSON.stringify(group.tags)}`);
  })
  .catch(error => {
    console.error('❌ Error fetching data:', error.message);
    process.exit(1);
  });
