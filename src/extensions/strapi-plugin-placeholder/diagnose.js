#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('=== DIAGNOSTIC SCRIPT FOR PLACEHOLDER PLUGIN ===\n');

// 1. Системная информация
console.log('1. SYSTEM INFORMATION:');
console.log(`   OS: ${os.platform()} ${os.release()}`);
console.log(`   Node.js: ${process.version}`);
console.log(`   Architecture: ${os.arch()}`);
console.log(`   Memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB total`);
console.log(`   CPU: ${os.cpus().length} cores`);
console.log('');

// 2. Проверка зависимостей
console.log('2. DEPENDENCIES CHECK:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log(`   Strapi version: ${packageJson.dependencies['@strapi/strapi'] || 'Not found'}`);

  // Проверяем plaiceholder
  try {
    require('plaiceholder');
    console.log('   ✅ plaiceholder: Installed');
  } catch (e) {
    console.log('   ❌ plaiceholder: Not installed');
  }

  // Проверяем sharp
  try {
    require('sharp');
    console.log('   ✅ sharp: Installed');
  } catch (e) {
    console.log('   ❌ sharp: Not installed');
  }

  // Проверяем mime-types
  try {
    require('mime-types');
    console.log('   ✅ mime-types: Installed');
  } catch (e) {
    console.log('   ❌ mime-types: Not installed');
  }
} catch (e) {
  console.log('   ❌ Cannot read package.json');
}
console.log('');

// 3. Проверка файловой системы
console.log('3. FILE SYSTEM CHECK:');
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (fs.existsSync(uploadsDir)) {
  console.log(`   ✅ Uploads directory exists: ${uploadsDir}`);
  try {
    const stats = fs.statSync(uploadsDir);
    console.log(`   Permissions: ${stats.mode.toString(8)}`);
    console.log(`   Owner: ${stats.uid}`);
  } catch (e) {
    console.log(`   ❌ Cannot read uploads directory: ${e.message}`);
  }
} else {
  console.log(`   ❌ Uploads directory missing: ${uploadsDir}`);
}

const logsDir = path.join(process.cwd(), 'logs');
if (fs.existsSync(logsDir)) {
  console.log(`   ✅ Logs directory exists: ${logsDir}`);
} else {
  console.log(`   ❌ Logs directory missing: ${logsDir}`);
}
console.log('');

// 4. Проверка логов
console.log('4. LOGS CHECK:');
const logFile = path.join(process.cwd(), 'public', 'logs', 'placeholder.log');
if (fs.existsSync(logFile)) {
  console.log(`   ✅ Log file exists: ${logFile}`);
  try {
    const stats = fs.statSync(logFile);
    console.log(`   Size: ${Math.round(stats.size / 1024)}KB`);
    console.log(`   Last modified: ${stats.mtime}`);

    // Показываем последние 10 строк
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim());
    console.log('   Last 10 log entries:');
    lines.slice(-10).forEach((line) => {
      console.log(`     ${line}`);
    });
  } catch (e) {
    console.log(`   ❌ Cannot read log file: ${e.message}`);
  }
} else {
  console.log(`   ❌ Log file missing: ${logFile}`);
}
console.log('');

// 5. Проверка конфигурации
console.log('5. CONFIGURATION CHECK:');
const configFiles = ['config/server.js', 'config/database.js', 'config/middlewares.js'];

configFiles.forEach((configFile) => {
  if (fs.existsSync(configFile)) {
    console.log(`   ✅ ${configFile}: Exists`);
  } else {
    console.log(`   ❌ ${configFile}: Missing`);
  }
});
console.log('');

// 6. Проверка плагина
console.log('6. PLUGIN CHECK:');
const pluginDir = path.join(process.cwd(), 'src', 'extensions', 'strapi-plugin-placeholder');
if (fs.existsSync(pluginDir)) {
  console.log(`   ✅ Plugin directory exists: ${pluginDir}`);

  const pluginFiles = [
    'server/src/index.ts',
    'server/src/bootstrap.ts',
    'server/src/register.ts',
    'server/src/services/placeholder.ts',
  ];

  pluginFiles.forEach((file) => {
    const filePath = path.join(pluginDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`     ✅ ${file}`);
    } else {
      console.log(`     ❌ ${file}`);
    }
  });
} else {
  console.log(`   ❌ Plugin directory missing: ${pluginDir}`);
}
console.log('');

// 7. Проверка процессов
console.log('7. PROCESS CHECK:');
try {
  const { execSync } = require('child_process');
  const processes = execSync('ps aux | grep -E "(node|strapi)" | grep -v grep', {
    encoding: 'utf8',
  });
  if (processes.trim()) {
    console.log('   Running Node.js processes:');
    processes
      .split('\n')
      .filter((line) => line.trim())
      .forEach((line) => {
        console.log(`     ${line}`);
      });
  } else {
    console.log('   No Node.js processes found');
  }
} catch (e) {
  console.log(`   ❌ Cannot check processes: ${e.message}`);
}
console.log('');

// 8. Рекомендации
console.log('8. RECOMMENDATIONS:');
console.log('   - Check server logs in Plesk panel');
console.log('   - Verify Node.js version compatibility');
console.log('   - Ensure sufficient memory for image processing');
console.log('   - Check file permissions on uploads directory');
console.log('   - Verify plaiceholder and sharp dependencies');
console.log('   - Test health endpoint: /api/placeholder/health');
console.log('');

console.log('=== DIAGNOSTIC COMPLETE ===');
console.log('Send this output along with server logs for further analysis.');
