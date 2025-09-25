#!/usr/bin/env node

// MASTRA Development Server
// This script starts the MASTRA playground for agent and tool testing

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting MASTRA Playground...');
console.log('📂 Project: Personal Finance PDF Parser Agent');
console.log('🔧 Environment: Development');
console.log('');

// Change to the project directory
process.chdir(__dirname);

// Start MASTRA with the playground
const mastraProcess = spawn('npx', ['mastra', 'playground'], {
  stdio: 'inherit',
  cwd: __dirname,
  env: {
    ...process.env,
    NODE_ENV: 'development'
  }
});

mastraProcess.on('error', (error) => {
  console.error('❌ Failed to start MASTRA:', error.message);
  process.exit(1);
});

mastraProcess.on('close', (code) => {
  console.log(`\n📋 MASTRA playground exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down MASTRA playground...');
  mastraProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down MASTRA playground...');
  mastraProcess.kill('SIGTERM');
});
