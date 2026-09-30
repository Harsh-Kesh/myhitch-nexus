const fs = require('fs');

let vc = fs.readFileSync('src/app/(public-video)/video/[id]/video-client.tsx', 'utf8').replace(/\r\n/g, '\n');

if (!vc.includes('IconPlay,')) {
  vc = vc.replace(
    /IconPlaylist,/,
    'IconPlay,\n  IconPlaylist,'
  );
}

fs.writeFileSync('src/app/(public-video)/video/[id]/video-client.tsx', vc);
