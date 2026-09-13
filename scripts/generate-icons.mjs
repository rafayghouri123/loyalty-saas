import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
mkdirSync('public/icons',{recursive:true});
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#166534"/><g fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"><path d="M166 222h146v90a50 50 0 0 1-50 50h-46a50 50 0 0 1-50-50z"/><path d="M312 230h18a37 37 0 0 1 0 74h-18M150 380h190M205 174v-30M245 174v-42M285 174v-30"/></g></svg>');
for(const size of [192,512])for(const kind of ['icon','maskable'])await sharp(svg).resize(size,size).png().toFile(`public/icons/${kind}-${size}-v1.png`);
