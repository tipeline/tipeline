// tsrunner.cjs
console.log('Starting tsrunner...');

// Used to recognize the path alias in the debugger like this one @task/TaskFactory
require('tsconfig-paths/register');
console.log('tsconfig-paths registered');

// Configure ts-node for ES modules
require('ts-node').register({
  esm: true,
  experimentalSpecifierResolution: 'node',
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    allowJs: true,
  }
});
console.log('ts-node registered');

// Use dynamic import for ES modules
console.log('Loading Server.ts...');
(async () => {
  try {
    await import('./src/engine/Server.ts');
  } catch (error) {
    console.error('Error loading Server.ts:', error);
    process.exit(1);
  }
})();