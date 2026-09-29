const fs = require('fs');
let code = fs.readFileSync('src/app/auth/register/page.tsx', 'utf8').replace(/\r\n/g, '\n');

const regex = /const ROLES: Array<\{[\s\S]*?\}> = \[\s*\{[\s\S]*?\}\s*\];/m;

const newRoles = `const ROLES: Array<{
  value: UserRole;
  title: string;
  description: string;
  icon: React.ReactNode;
  /** Roles that must pass organisation verification before publishing. */
  requiresOrg?: boolean;
  requiresMfa?: boolean;
}> = [
  {
    value: "viewer",
    title: "End User",
    description: "Watch for free with ads, or subscribe to Premium / Family plans. Set up household profiles.",
    icon: <IconDeviceTv />,
  },
  {
    value: "business",
    title: "Business & Creator",
    description: "Publish content, run branded channels, monetize, launch ad campaigns, & manage team access.",
    icon: <IconBuildingStore />,
    requiresOrg: true,
    requiresMfa: true,
  },
];`;

code = code.replace(regex, newRoles);

// Update post-registration routing
const routeRegex = /router\.push\([\s\S]*?role === "creator"[\s\S]*?\);/m;
const newRoute = `router.push(
          role === "business" ? "/studio/dashboard" : "/"
        );`;
code = code.replace(routeRegex, newRoute);

fs.writeFileSync('src/app/auth/register/page.tsx', code);
