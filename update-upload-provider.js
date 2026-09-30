const fs = require('fs');
let code = fs.readFileSync('src/components/upload/upload-provider.tsx', 'utf8').replace(/\r\n/g, '\n');

// 1. Add import
if (!code.includes('useCurrentUser')) {
  code = code.replace(/import { useToast } from "@\/components\/ui\/toast";/, 'import { useToast } from "@/components/ui/toast";\nimport { useCurrentUser } from "@/lib/mock-api/hooks";');
}

// 2. Add accountId to ActiveUpload
if (!code.includes('accountId?: string;')) {
  code = code.replace(/startedAt: string;\n\}/, 'startedAt: string;\n  accountId?: string;\n}');
}

// 3. Add useCurrentUser to UploadProvider
if (!code.includes('const { data: currentUser } = useCurrentUser();')) {
  code = code.replace(/const { toast } = useToast\(\);/, 'const { toast } = useToast();\n  const { data: currentUser } = useCurrentUser();\n  const currentUserIdRef = React.useRef(currentUser?.id);\n  React.useEffect(() => { currentUserIdRef.current = currentUser?.id; }, [currentUser?.id]);');
}

// 4. Update startUpload
const startUploadRegex = /const newUpload: ActiveUpload = \{\n\s*id: `upload_\$\{Date\.now\(\)\}`,/;
code = code.replace(startUploadRegex, `const newUpload: ActiveUpload = {
        id: \`upload_\${Date.now()}\`,
        accountId: currentUserIdRef.current,`);

// 5. Update toast logic in the setInterval
const toastRegex = /if \(!toastFiredRef\.current\) \{\n\s*toastFiredRef\.current = true;\n\s*toast\(\{/;
const toastReplacement = `if (!toastFiredRef.current) {
            toastFiredRef.current = true;
            if (!current.accountId || current.accountId === currentUserIdRef.current) {
              toast({`;
code = code.replace(toastRegex, toastReplacement);

// 6. Update conditional rendering of the widget
const renderRegex = /\{activeUpload && !widgetDismissed && activeUpload\.phase !== "idle" \? \(/;
const renderReplacement = `{activeUpload && !widgetDismissed && activeUpload.phase !== "idle" && (!activeUpload.accountId || activeUpload.accountId === currentUser?.id) ? (`;
code = code.replace(renderRegex, renderReplacement);

// We need to close the if statement for the toast
const toastEndRegex = /description: `'[^']+`,\n\s*\}\);\n\s*\}/;
const toastEndReplacement = `description: \`'\${current.draftData.title || current.fileName}' has finished processing and is saved as a draft. Click to review & publish.\`,
              });
            }
          }`;
code = code.replace(toastEndRegex, toastEndReplacement);

fs.writeFileSync('src/components/upload/upload-provider.tsx', code);
