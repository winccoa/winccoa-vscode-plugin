const { exec } = require('child_process');
const path = require('path');

// Change to parent directory and run npm run compile
const parentDir = path.resolve(__dirname, '../');

console.log(`Running 'npm run compile' in ${parentDir}...`);

exec('npm run compile', { cwd: parentDir }, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error executing npm run compile: ${error}`);
        process.exit(1);
    }
    
    if (stderr) {
        console.error(`stderr: ${stderr}`);
    }
    
    console.log(`stdout: ${stdout}`);
    console.log('npm run compile executed successfully!');
});