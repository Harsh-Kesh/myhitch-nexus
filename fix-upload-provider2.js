const fs = require('fs');
let code = fs.readFileSync('src/components/upload/upload-provider.tsx', 'utf8').replace(/\r\n/g, '\n');

const regex = /if \(!toastFiredRef\.current\) \{\n\s*toastFiredRef\.current = true;\n\s*if \(!current\.accountId \|\| current\.accountId === currentUserIdRef\.current\) \{\n\s*toast\(\{\n\s*title: "Upload & Transcoding Complete!",\n\s*description: `'\$\{current\.draftData\.title \|\| current\.fileName\}' has finished processing and is saved as a draft\. Click to review & publish\.`,\n\s*\}\);\n\s*\}\n\s*\}/m;

const replacement = `if (!toastFiredRef.current) {
            toastFiredRef.current = true;
            if (!current.accountId || current.accountId === currentUserIdRef.current) {
              toast({
                title: "Upload & Transcoding Complete!",
                description: \`'\${current.draftData.title || current.fileName}' has finished processing and is saved as a draft. Click to review & publish.\`,
              });
            }
          }
        }`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/upload/upload-provider.tsx', code);
