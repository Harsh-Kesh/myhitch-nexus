const fs = require('fs');

// 1. Update Registration Page Redirect
let pageCode = fs.readFileSync('src/app/auth/register/page.tsx', 'utf8').replace(/\r\n/g, '\n');
pageCode = pageCode.replace(
  /router\.push\(\n\s*role === "business" \? "\/studio\/dashboard" : "\/"\n\s*\);/,
  'router.push("/plans");'
);
fs.writeFileSync('src/app/auth/register/page.tsx', pageCode);

// 2. Update Registration Backend ABN Validation
let routeCode = fs.readFileSync('src/app/api/auth/register/route.ts', 'utf8').replace(/\r\n/g, '\n');
const abnValidationStr = `  const abn = body.abn?.trim();
  if ((dbRole === "business" || dbRole === "producer") && !abn) {
    return NextResponse.json({ error: "An ABN is required for Business and Enterprise accounts." }, { status: 400 });
  }`;

const replacementValidationStr = `  const abn = body.abn?.trim();
  if ((dbRole === "business" || dbRole === "producer") && !abn) {
    return NextResponse.json({ error: "An ABN is required for Business and Enterprise accounts." }, { status: 400 });
  }

  // Automated ABN verification
  if (abn) {
    // Basic format check: ABN must be 11 digits (with or without spaces)
    const cleanedAbn = abn.replace(/\\s+/g, '');
    if (!/^\\d{11}$/.test(cleanedAbn)) {
      return NextResponse.json({ error: "Invalid ABN format. An ABN must be 11 digits." }, { status: 400 });
    }
    // Mock failure: any ABN starting with 000 fails verification
    if (cleanedAbn.startsWith("000")) {
      return NextResponse.json({ error: "ABN Verification Failed. The business number could not be validated." }, { status: 403 });
    }
  }`;

routeCode = routeCode.replace(abnValidationStr, replacementValidationStr);
fs.writeFileSync('src/app/api/auth/register/route.ts', routeCode);
