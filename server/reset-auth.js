const fs = require('node:fs');
const path = require('node:path');
const { CredentialsStore } = require('./lib/credentials-store');

// Load .env manually if process.env.MASTER_KEY is not defined
if (!process.env.MASTER_KEY) {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*MASTER_KEY\s*=\s*(["']?)(.*?)\1\s*$/);
      if (match) {
        process.env.MASTER_KEY = match[2];
        break;
      }
    }
  }
}

const masterKey = process.env.MASTER_KEY;
if (!masterKey) {
  console.error('Error: MASTER_KEY is not set in environment or .env file.');
  process.exit(1);
}

try {
  const store = new CredentialsStore(masterKey);
  const passkeysExist = store.getEncryptedConfig('auth_passkeys');
  
  if (passkeysExist) {
    store.deleteConfig('auth_passkeys');
    console.log('Successfully removed all registered Passkeys (WebAuthn).');
    console.log('The lock screen is now disabled, and you can access the app to register a new Passkey.');
  } else {
    console.log('No Passkeys are currently registered. The system is already unlocked/unconfigured.');
  }
  
  store.close();
  process.exit(0);
} catch (error) {
  console.error('Failed to reset passkeys:', error.message);
  process.exit(1);
}
