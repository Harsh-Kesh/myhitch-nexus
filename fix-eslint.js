const fs = require('fs');

let code = fs.readFileSync('src/app/studio/upload/page.tsx', 'utf8').replace(/\r\n/g, '\n');

// Import IconLock
if (!code.includes('IconLock')) {
  code = code.replace(
    /import \{ IconChevronLeft, IconChevronRight/,
    'import { IconLock, IconChevronLeft, IconChevronRight'
  );
}

// Remove ACCESS_MODELS and accessModels variables
code = code.replace(/const ACCESS_MODELS: Array<\{ value: AccessModel; label: string; description: string \}> = \[\s*\{ value: "free", label: "Free", description: "Anyone can watch\. No advertising\." \},\s*\{ value: "ad-supported", label: "Advertising-supported", description: "Free to watch, monetised with pre\/mid-roll\." \},\s*\{ value: "subscription", label: "Requires a paid plan", description: "Included with Nexus Premium or Family\." \},\s*\];/m, '');

code = code.replace(/const \[accessModels, setAccessModels\] = React\.useState<AccessModel\[\]>\(\["ad-supported"\]\);\n\s*/, '');

fs.writeFileSync('src/app/studio/upload/page.tsx', code);
