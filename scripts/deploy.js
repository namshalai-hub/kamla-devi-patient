import { execSync } from 'child_process';

try {
  // Step 1: Build locally using Vite
  console.log('Building project locally...');
  execSync('npm.cmd run build', { stdio: 'inherit' });

  // Step 2: Run vercel build to generate .vercel/output (required for --prebuilt)
  console.log('\nPreparing Vercel build output...');
  execSync('npx vercel build --prod --yes', { stdio: 'inherit' });

  // Step 3: Deploy the pre-built output to Vercel production
  console.log('\nDeploying to Vercel production...');
  execSync('npx vercel deploy --prebuilt --prod --yes', { stdio: 'inherit' });

  console.log('\n==================================================================');
  console.log('Success! Your app is now live at: https://kamla-devi-patient.vercel.app');
  console.log('==================================================================\n');
} catch (err) {
  console.error('Deployment failed:', err.message);
  process.exit(1);
}
