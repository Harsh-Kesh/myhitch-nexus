const fs = require('fs');

let authRoute = fs.readFileSync('src/app/api/auth/register/route.ts', 'utf8').replace(/\r\n/g, '\n');

const abnValidationOld = `  // Automated ABN verification
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

const abnValidationNew = `  // Automated ABN verification
  if (abn) {
    const cleanedAbn = abn.replace(/\\s+/g, '');
    if (!/^\\d{11}$/.test(cleanedAbn)) {
      return NextResponse.json({ error: "Invalid ABN format. An ABN must be 11 digits." }, { status: 400 });
    }
    
    // Real ABR Lookup
    const { lookupAbn } = await import("@/lib/server/abnLookup");
    try {
      const result = await lookupAbn(cleanedAbn);
      if (!result.found) {
        return NextResponse.json({ error: result.message || "ABN Verification Failed. The business number could not be validated." }, { status: 403 });
      }
      // If we wanted, we could override body.orgName with result.entityName here!
      if (!body.orgName?.trim()) {
        body.orgName = result.entityName;
      }
    } catch (err: any) {
      if (err.message?.includes("isn't configured")) {
        // Fallback to mock for local dev if no GUID is set
        if (cleanedAbn.startsWith("000")) {
          return NextResponse.json({ error: "ABN Verification Failed (Mock). The business number could not be validated." }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: "ABN Verification service is temporarily unavailable." }, { status: 502 });
      }
    }
  }`;

authRoute = authRoute.replace(abnValidationOld, abnValidationNew);

fs.writeFileSync('src/app/api/auth/register/route.ts', authRoute);
