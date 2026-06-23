import { execSync } from 'child_process';

try {
  // Deploy the project to Vercel production and build on Vercel servers
  console.log('Deploying to Vercel production (building on Vercel cloud)...');
  execSync('npx.cmd vercel deploy --prod --yes', { stdio: 'inherit' });

  console.log('\n==================================================================');
  console.log('Success! Your app is now live at: https://kamla-devi-patient.vercel.app');
  console.log('==================================================================\n');
} catch (err) {
  try {
    // Fallback for macOS/Linux or systems where npx is global
    execSync('npx vercel deploy --prod --yes', { stdio: 'inherit' });
    console.log('\n==================================================================');
    console.log('Success! Your app is now live at: https://kamla-devi-patient.vercel.app');
    console.log('==================================================================\n');
  } catch (innerErr) {
    console.error('Deployment failed:', innerErr.message);
    process.exit(1);
  }
}
