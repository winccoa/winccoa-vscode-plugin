rem #!/bin/bash
git clean -fdx
npm install
npm run compile
vsce package