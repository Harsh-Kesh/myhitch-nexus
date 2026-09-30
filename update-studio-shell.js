const fs = require('fs');

let code = fs.readFileSync('src/app/studio/studio-shell.tsx', 'utf8').replace(/\r\n/g, '\n');

const regex = /\{ href: "\/studio\/magazine", label: "Magazine", icon: <IconNews \/> \},\n\s*\{ href: "\/studio\/sponsorship", label: "Exchange Hub", icon: <IconSpeakerphone \/> \}/m;

const replacement = `...(user?.roles.includes("viewer") ? [] : [
              { href: "/studio/magazine", label: "MYHitch Lens", icon: <IconNews /> },
              { href: "/studio/sponsorship", label: "Exchange Hub", icon: <IconSpeakerphone /> },
            ])`;

code = code.replace(regex, replacement);

const regex2 = /\{\n\s*href: "\/studio\/analytics",\n\s*label: "Analytics",\n\s*icon: <IconChartHistogram \/>,\n\s*\},\n\s*\{ href: "\/studio\/revenue", label: "Revenue", icon: <IconCoin \/> \},/m;

const replacement2 = `...(user?.roles.includes("viewer") ? [] : [
              { href: "/studio/analytics", label: "Analytics", icon: <IconChartHistogram /> },
              { href: "/studio/revenue", label: "Revenue", icon: <IconCoin /> },
            ])`;
            
code = code.replace(regex2, replacement2);
fs.writeFileSync('src/app/studio/studio-shell.tsx', code);
