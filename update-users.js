const fs = require('fs');
let code = fs.readFileSync('src/lib/mock-api/data/users.ts', 'utf8');

code = code.replace(
  /  policy: \{\s*title: "Policy & safety",\s*description: "Moderation decisions and policy updates affecting you.",\s*\},/,
  `  policy: {
    title: "Policy & safety",
    description: "Moderation decisions and policy updates affecting you.",
  },
  "profile-created": {
    title: "Profile Created",
    description: "Alerts when a new family profile is created.",
  },
  "profile-updated": {
    title: "Profile Updated",
    description: "Alerts when a family profile is updated.",
  },
  "profile-removed": {
    title: "Profile Removed",
    description: "Alerts when a family profile is removed.",
  },
  "settings-updated": {
    title: "Settings Updated",
    description: "Alerts when your account settings are changed.",
  },
  "account-registered": {
    title: "Account Registered",
    description: "Welcome alerts for new accounts.",
  },
  "subscription-updated": {
    title: "Subscription Updates",
    description: "Alerts when your subscription plan changes.",
  },`
);

code = code.replace(
  /  policy: \{ inApp: true, email: true, push: false \},/,
  `  policy: { inApp: true, email: true, push: false },
  "profile-created": { inApp: true, email: true, push: false },
  "profile-updated": { inApp: true, email: true, push: false },
  "profile-removed": { inApp: true, email: true, push: false },
  "settings-updated": { inApp: true, email: true, push: false },
  "account-registered": { inApp: true, email: true, push: false },
  "subscription-updated": { inApp: true, email: true, push: false },`
);

fs.writeFileSync('src/lib/mock-api/data/users.ts', code);
